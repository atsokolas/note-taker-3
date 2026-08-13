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
 * Safe to re-run. Point IDs are deterministic (`qdrantClient.toPointId`), so a
 * second pass overwrites rather than duplicates, and `--skip` resumes.
 *
 * Usage:
 *   node scripts/backfill_embeddings.js --user <id> [options]
 *
 *   --user <id>      required; the user whose corpus to index
 *   --types a,b      articles,highlights,notebook,questions,claims (default: all)
 *   --limit <n>      stop after n items (default: no limit)
 *   --skip <n>       skip the first n items of each type (for resuming)
 *   --delay <ms>     pause between requests (default: 1200)
 *   --dry-run        report what would be indexed, call nothing
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { embedText } = require('../server/ai/embed');
const { upsertVector } = require('../server/ai/qdrantClient');
const { COLLECTIONS, isEmbeddableWikiClaim } = require('../server/ai/embeddingJobs');

const ALL_TYPES = ['articles', 'highlights', 'notebook', 'questions', 'claims'];
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
            collection: COLLECTIONS.articles,
            id: String(article._id),
            text,
            payload: {
              type: 'article',
              objectId: String(article._id),
              title: article.title || '',
              tags: [],
              createdAt: article.createdAt || new Date().toISOString(),
              userId: String(userId)
            }
          });
        }
      }
      if (types.includes('highlights')) {
        (article.highlights || []).forEach(highlight => {
          const text = strip(highlight.text || '');
          if (text.length < 20) return;
          items.push({
            collection: COLLECTIONS.highlights,
            id: String(highlight._id),
            text,
            payload: {
              type: 'highlight',
              objectId: String(highlight._id),
              title: highlight.text || '',
              articleTitle: article.title || '',
              articleId: String(article._id),
              tags: highlight.tags || [],
              createdAt: highlight.createdAt || article.createdAt || new Date().toISOString(),
              userId: String(userId)
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
        collection: COLLECTIONS.notebook,
        id: String(entry._id),
        text,
        payload: {
          type: 'notebook_entry',
          objectId: String(entry._id),
          title: entry.title || '',
          tags: entry.tags || [],
          createdAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
          userId: String(userId)
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
        collection: COLLECTIONS.questions,
        id: String(question._id),
        text,
        payload: {
          type: 'question',
          objectId: String(question._id),
          title: question.text || '',
          tags: [question.conceptName || question.linkedTagName].filter(Boolean),
          createdAt: question.updatedAt || question.createdAt || new Date().toISOString(),
          userId: String(userId)
        }
      });
    });
  }

  if (types.includes('claims')) {
    const pages = await WikiPage.find({ userId, status: { $ne: 'archived' } }).select('_id title claims createdAt').lean();
    pages.forEach(page => {
      (page.claims || []).forEach(claim => {
        if (!isEmbeddableWikiClaim(claim)) return;
        const objectId = `${String(page._id)}:${String(claim.claimId)}`;
        items.push({
          collection: COLLECTIONS.claims,
          id: objectId,
          text: strip(`${page.title || ''}\n${claim.text || ''}`),
          payload: {
            type: 'wiki_claim',
            objectId,
            pageId: String(page._id),
            claimId: String(claim.claimId),
            title: page.title || '',
            createdAt: claim.createdAt || page.createdAt || new Date().toISOString(),
            userId: String(userId)
          }
        });
      });
    });
  }

  return items;
};

(async () => {
  const userId = arg('user');
  if (!userId || userId === true) {
    console.error('--user <id> is required.');
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

  const all = await collect(models, new mongoose.Types.ObjectId(userId), types);
  const byCollection = all.reduce((acc, item) => {
    acc[item.collection] = (acc[item.collection] || 0) + 1;
    return acc;
  }, {});
  console.log(`found ${all.length} embeddable items:`);
  Object.entries(byCollection).forEach(([collection, n]) => console.log(`  ${collection}: ${n}`));

  const queue = all.slice(skip, limit ? skip + limit : undefined);
  console.log(`\nprocessing ${queue.length} (skip=${skip}${limit ? `, limit=${limit}` : ''}), ${delayMs}ms between requests`);
  if (dryRun) {
    console.log('dry run — nothing called');
    await mongoose.disconnect();
    return;
  }

  let done = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    try {
      const vector = await embedText(item.text);
      await upsertVector({ collection: item.collection, id: item.id, vector, payload: item.payload });
      done += 1;
      consecutiveFailures = 0;
    } catch (error) {
      failed += 1;
      consecutiveFailures += 1;
      console.error(`  ✗ ${item.collection}/${item.id}: ${String(error.message).slice(0, 120)}`);
      // A rate-limited upstream will not recover inside this loop. Stopping
      // early leaves a clean resume point instead of burning through the
      // remaining items collecting identical 429s.
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
        console.error(`\nstopped after ${CONSECUTIVE_FAILURE_LIMIT} consecutive failures.`);
        console.error(`resume with: --skip ${skip + i - CONSECUTIVE_FAILURE_LIMIT + 1}`);
        break;
      }
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${queue.length} (indexed ${done}, failed ${failed})`);
    if (delayMs > 0) await sleep(delayMs);
  }

  console.log(`\nindexed ${done}, failed ${failed}, of ${queue.length}`);
  if (done && failed === 0 && skip + queue.length < all.length) {
    console.log(`more remain — resume with: --skip ${skip + queue.length}`);
  }
  await mongoose.disconnect();
})().catch(error => { console.error(error); process.exit(1); });
