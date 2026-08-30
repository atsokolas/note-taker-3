#!/usr/bin/env node
/**
 * Backfill the semantic index.
 *
 * The embedding job worker batches five jobs a minute against a rate-limited
 * upstream, which is how 133 jobs reached `abandoned` with
 * "AI service error 429" between 2026-06-21 and 2026-08-13 without a single
 * completion. This script exists because a backfill needs the opposite
 * behaviour: one request at a time, a deliberate pause between them, and an
 * immediate stop when the upstream starts refusing.
 *
 * Safe to re-run, and cheap to re-run: rows carry a content hash, so unchanged
 * items skip the embedding call entirely. `--skip` resumes a partial pass.
 *
 * Usage:
 *   node scripts/backfill_embeddings.js --user <id> [options]
 *   node scripts/backfill_embeddings.js --all-users [options]
 *
 *   --user <id>      the user whose corpus to index (or --all-users)
 *   --all-users      every user with content, smallest corpus first
 *   --types a,b      articles,highlights,notebook,questions,judgments,claims,pages (default: all)
 *   --limit <n>      stop after n items (default: no limit)
 *   --skip <n>       skip the first n items of each type (for resuming)
 *   --delay <ms>     pause between requests (default: 1200)
 *   --dry-run        report what would be indexed, call nothing
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { embedText } = require('../server/ai/embed');
const { upsertVectorItem, isVectorItemCurrent } = require('../server/ai/vectorStore');
const { isEmbeddableWikiClaim } = require('../server/ai/embeddingJobs');

const ALL_TYPES = ['articles', 'highlights', 'notebook', 'questions', 'judgments', 'claims', 'pages'];
const CONSECUTIVE_FAILURE_LIMIT = 5;

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
};

const strip = (v = '') => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const collect = async (models, userId, types) => {
  const items = [];
  const { Article, NotebookEntry, Question, WikiPage } = models;

  if (types.includes('articles') || types.includes('highlights')) {
    const articles = await Article.find({ userId }).select('_id title content createdAt highlights').lean();
    articles.forEach(article => {
      if (types.includes('articles')) {
        const text = strip(`${article.title || ''}\n${strip(article.content || '').slice(0, 800)}`);
        if (text.length >= 20) {
          items.push({
            objectType: 'article',
            objectId: String(article._id),
            text,
            metadata: { title: article.title || '', createdAt: article.createdAt || new Date().toISOString() }
          });
        }
      }
      if (types.includes('highlights')) {
        (article.highlights || []).forEach(highlight => {
          const text = strip(highlight.text || '');
          if (text.length < 20) return;
          items.push({
            objectType: 'highlight',
            objectId: String(highlight._id),
            text,
            metadata: {
              title: highlight.text || '',
              articleTitle: article.title || '',
              articleId: String(article._id),
              tags: highlight.tags || [],
              createdAt: highlight.createdAt || article.createdAt || new Date().toISOString()
            }
          });
        });
      }
    });
  }

  if (types.includes('notebook')) {
    const entries = await NotebookEntry.find({ userId }).select('_id title content blocks tags createdAt updatedAt').lean();
    entries.forEach(entry => {
      const body = Array.isArray(entry.blocks) && entry.blocks.length
        ? entry.blocks.map(block => block?.text || '').filter(Boolean).join('\n')
        : strip(entry.content || '');
      const text = strip(`${entry.title || ''}\n${body}`);
      if (text.length < 20) return;
      items.push({
        objectType: 'notebook_entry',
        objectId: String(entry._id),
        text,
        metadata: {
          title: entry.title || '',
          tags: entry.tags || [],
          createdAt: entry.updatedAt || entry.createdAt || new Date().toISOString()
        }
      });
    });
  }

  if (types.includes('questions')) {
    const questions = await Question.find({ userId }).select('_id text conceptName linkedTagName createdAt updatedAt').lean();
    questions.forEach(question => {
      const text = strip(question.text || '');
      if (text.length < 20) return;
      items.push({
        objectType: 'question',
        objectId: String(question._id),
        text,
        metadata: {
          title: question.text || '',
          tags: [question.conceptName || question.linkedTagName].filter(Boolean),
          createdAt: question.updatedAt || question.createdAt || new Date().toISOString()
        }
      });
    });
  }

  if (types.includes('judgments') || types.includes('claims') || types.includes('pages')) {
    const pages = await WikiPage.find({ userId, status: { $ne: 'archived' } })
      .select('_id title judgment.currentJudgment claims plainText createdAt updatedAt').lean();
    pages.forEach(page => {
      if (types.includes('judgments')) {
        const text = strip(page?.judgment?.currentJudgment || '');
        if (text) {
          items.push({
            objectType: 'judgment_claim',
            objectId: String(page._id),
            text,
            metadata: {
              pageId: String(page._id),
              title: page.title || '',
              createdAt: page.updatedAt || page.createdAt || new Date().toISOString()
            }
          });
        }
      }
      if (types.includes('claims')) {
        (page.claims || []).forEach(claim => {
          if (!isEmbeddableWikiClaim(claim)) return;
          const objectId = `${String(page._id)}:${String(claim.claimId)}`;
          items.push({
            objectType: 'wiki_claim',
            objectId,
            text: strip(`${page.title || ''}\n${claim.text || ''}`),
            metadata: {
              pageId: String(page._id),
              claimId: String(claim.claimId),
              title: page.title || '',
              createdAt: claim.createdAt || page.createdAt || new Date().toISOString()
            }
          });
        });
      }
      if (types.includes('pages')) {
        // Long pages are chunked: a single vector over 3,000 words averages away
        // the passage that actually answers the question, which is the point of
        // asking. Each chunk carries a subId so retrieval can cite the passage.
        const body = strip(page.plainText || '');
        const full = strip(`${page.title || ''}\n${body}`);
        if (full.length >= 40) {
          const CHUNK = 6000;
          if (full.length <= CHUNK) {
            items.push({
              objectType: 'wiki_page',
              objectId: String(page._id),
              text: full,
              metadata: { title: page.title || '', createdAt: page.updatedAt || page.createdAt || new Date().toISOString() }
            });
          } else {
            for (let start = 0, part = 0; start < body.length; start += CHUNK, part += 1) {
              const chunk = strip(`${page.title || ''}\n${body.slice(start, start + CHUNK)}`);
              if (chunk.length < 40) continue;
              items.push({
                objectType: 'wiki_page',
                objectId: String(page._id),
                subId: `p${part}`,
                text: chunk,
                metadata: { title: page.title || '', chunk: part, createdAt: page.updatedAt || page.createdAt || new Date().toISOString() }
              });
            }
          }
        }
      }
    });
  }

  return items;
};

const runForUser = async ({ models, ownerId, types, limit, skip, delayMs, dryRun }) => {
  const all = await collect(models, ownerId, types);
  const byCollection = all.reduce((acc, item) => {
    acc[item.objectType] = (acc[item.objectType] || 0) + 1;
    return acc;
  }, {});
  console.log(`found ${all.length} embeddable items:`);
  Object.entries(byCollection).forEach(([collection, n]) => console.log(`  ${collection}: ${n}`));

  const queue = all.slice(skip, limit ? skip + limit : undefined);
  console.log(`\nprocessing ${queue.length} (skip=${skip}${limit ? `, limit=${limit}` : ''}), ${delayMs}ms between requests`);
  if (dryRun) {
    console.log('dry run — nothing called');
    return { indexed: 0, unchanged: 0, failed: 0, total: all.length };
  }

  let done = 0;
  let failed = 0;
  let skippedUnchanged = 0;
  let consecutiveFailures = 0;
  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    try {
      const identity = {
        VectorItem: models.VectorItem,
        userId: item.userId || ownerId,
        objectType: item.objectType,
        objectId: item.objectId,
        subId: item.subId || '',
        text: item.text
      };
      if (await isVectorItemCurrent(identity)) {
        skippedUnchanged += 1;
        consecutiveFailures = 0;
        continue;
      }
      const vector = await embedText(item.text);
      await upsertVectorItem({ ...identity, vector, metadata: item.metadata });
      done += 1;
      consecutiveFailures = 0;
    } catch (error) {
      failed += 1;
      consecutiveFailures += 1;
      console.error(`  ✗ ${item.objectType}/${item.objectId}: ${String(error.message).slice(0, 120)}`);
      // A rate-limited upstream will not recover inside this loop. Stopping
      // early leaves a clean resume point instead of burning through the
      // remaining items collecting identical 429s.
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
        console.error(`\nstopped after ${CONSECUTIVE_FAILURE_LIMIT} consecutive failures.`);
        console.error(`resume with: --skip ${skip + i - CONSECUTIVE_FAILURE_LIMIT + 1}`);
        break;
      }
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${queue.length} (indexed ${done}, unchanged ${skippedUnchanged}, failed ${failed})`);
    if (delayMs > 0) await sleep(delayMs);
  }

  console.log(`\nindexed ${done}, unchanged ${skippedUnchanged}, failed ${failed}, of ${queue.length}`);
  if (done && failed === 0 && skip + queue.length < all.length) {
    console.log(`more remain — resume with: --skip ${skip + queue.length}`);
  }
  return { indexed: done, unchanged: skippedUnchanged, failed, total: all.length };
};

(async () => {
  const singleUser = arg('user');
  const allUsers = arg('all-users', false) === true;
  if ((!singleUser || singleUser === true) && !allUsers) {
    console.error('--user <id> or --all-users is required.');
    process.exit(1);
  }
  const types = String(arg('types', ALL_TYPES.join(','))).split(',').map(t => t.trim()).filter(Boolean);
  const unknown = types.filter(t => !ALL_TYPES.includes(t));
  if (unknown.length) {
    console.error(`Unknown types: ${unknown.join(', ')}. Valid: ${ALL_TYPES.join(', ')}`);
    process.exit(1);
  }
  const limit = Number(arg('limit', 0)) || 0;
  const skip = Number(arg('skip', 0)) || 0;
  const delayMs = Number(arg('delay', 1200));
  const dryRun = arg('dry-run', false) === true;

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  const models = require('../server/models');

  let owners = [];
  if (allUsers) {
    // Smallest corpus first: a cheap early pass surfaces a systemic problem
    // before an hour has been spent on the largest account.
    const counts = await models.Article.aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }, { $sort: { n: 1 } }]);
    owners = counts.map(row => row._id).filter(Boolean);
    console.log(`--all-users: ${owners.length} users with content\n`);
  } else {
    owners = [new mongoose.Types.ObjectId(String(singleUser))];
  }

  const totals = { indexed: 0, unchanged: 0, failed: 0 };
  for (const ownerId of owners) {
    if (owners.length > 1) console.log(`\n=== user ${ownerId} ===`);
    const result = await runForUser({ models, ownerId, types, limit, skip, delayMs, dryRun });
    totals.indexed += result.indexed;
    totals.unchanged += result.unchanged;
    totals.failed += result.failed;
  }
  if (owners.length > 1) {
    console.log(`\nALL USERS — indexed ${totals.indexed}, unchanged ${totals.unchanged}, failed ${totals.failed}`);
  }
  await mongoose.disconnect();
})().catch(error => { console.error(error); process.exit(1); });
