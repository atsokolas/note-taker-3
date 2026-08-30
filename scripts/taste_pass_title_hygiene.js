#!/usr/bin/env node
/**
 * Taste Pass T3 — Library title hygiene. Dry-run by default.
 *
 * Scans article titles (scope=all unless --user-id is set). Prints named
 * offenders and every fragment it would rewrite. Does not write unless
 * `--apply --user-id=<id>` is passed. Do not run --apply against production
 * without listing the ids from a dry-run first.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { Article } = require('../server/models');
const {
  NAMED_LIBRARY_FRAGMENT_EXAMPLES,
  isFragmentTitle,
  planArticleTitleRepair
} = require('../server/services/importTitleService');

const numberArg = (argv, name, fallback, maximum) => {
  const value = Number(argv.find(arg => arg.startsWith(`${name}=`))?.split('=')[1]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
};

const stringArg = (argv, name) => String(
  argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1) || ''
).trim();

const namedBefore = new Set(
  NAMED_LIBRARY_FRAGMENT_EXAMPLES.map(example => example.before.toLowerCase())
);

const main = async () => {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const limit = numberArg(argv, '--limit', 5_000, 20_000);
  const maxTimeMs = numberArg(argv, '--max-time-ms', 30_000, 120_000);
  const userId = stringArg(argv, '--user-id');
  if (apply && !userId) throw new Error('--apply requires an explicit --user-id.');
  const scope = userId ? { userId } : {};
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: maxTimeMs });
  console.error(`[taste-t3] connected; auditing up to ${limit} article titles (${userId || 'scope=all'})`);

  const articleHeads = await Article.find({ ...scope, archived: { $ne: true } })
    .select('_id userId title')
    .limit(limit)
    .maxTimeMS(maxTimeMs)
    .lean();
  const fragmentIds = articleHeads
    .filter(article => isFragmentTitle(article.title))
    .map(article => article._id);
  const articles = fragmentIds.length
    ? await Article.find({ _id: { $in: fragmentIds } })
      .select('_id userId title content author siteName publicationDate url importMeta.sourceType highlights.text createdAt')
      .maxTimeMS(maxTimeMs)
      .lean()
    : [];
  const articleTitleChanges = articles
    .map(article => planArticleTitleRepair(article))
    .filter(Boolean);
  const namedOffenders = articleTitleChanges.filter(change => (
    namedBefore.has(String(change.before || '').toLowerCase())
  ));
  const namedMissing = NAMED_LIBRARY_FRAGMENT_EXAMPLES
    .map(example => example.before)
    .filter(before => !namedOffenders.some(change => (
      String(change.before || '').toLowerCase() === before.toLowerCase()
    )));

  if (apply && articleTitleChanges.length) {
    await Article.bulkWrite(articleTitleChanges.map(change => ({
      updateOne: { filter: { _id: change.id }, update: { $set: { title: change.after } } }
    })));
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scope: { userId: userId || 'all' },
    scanned: articleHeads.length,
    fragmentCount: fragmentIds.length,
    auditCount: articleTitleChanges.length,
    namedOffenders,
    namedMissingFromScan: namedMissing,
    articleTitleChanges
  }, null, 2));
};

main()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    try { await mongoose.disconnect(); } catch (_disconnectError) { /* surface original */ }
    console.error(error);
    process.exit(1);
  });
