#!/usr/bin/env node
/**
 * AT-426 — claim bornAt backfill. Dry-run by default.
 *
 * Prints every claim whose birth date would change. Does not write unless
 * `--apply --user-id=<id>` is passed. Do not run --apply against production
 * without listing the ids from a dry-run first.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { WikiPage } = require('../server/models');
const {
  applyClaimBornAtChanges,
  planClaimBornAtBackfill
} = require('../server/services/claimBornAt');

const numberArg = (argv, name, fallback, maximum) => {
  const value = Number(argv.find(arg => arg.startsWith(`${name}=`))?.split('=')[1]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
};

const stringArg = (argv, name) => String(
  argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1) || ''
).trim();

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
  console.error(`[claim-born-at] connected; auditing up to ${limit} wiki pages (${userId || 'scope=all'})`);

  const pages = await WikiPage.find({ ...scope, status: { $ne: 'archived' } })
    .select('_id userId createdAt claims.claimId claims.bornAt claims.createdAt claims.history.at')
    .limit(limit)
    .maxTimeMS(maxTimeMs)
    .lean();
  console.error(`[claim-born-at] scanned ${pages.length} wiki pages`);

  const now = new Date();
  const changes = planClaimBornAtBackfill(pages, { now });

  if (apply) {
    const pageIds = [...new Set(changes.map(change => change.pageId).filter(Boolean))];
    const writePages = pageIds.length
      ? await WikiPage.find({ _id: { $in: pageIds } })
        .select('_id claims createdAt')
        .maxTimeMS(maxTimeMs)
        .lean()
      : [];
    const changesByPage = new Map();
    changes.forEach((change) => {
      if (!changesByPage.has(change.pageId)) changesByPage.set(change.pageId, []);
      changesByPage.get(change.pageId).push(change);
    });
    for (const page of writePages) {
      const pageChanges = changesByPage.get(String(page._id)) || [];
      await WikiPage.updateOne({ _id: page._id }, {
        $set: {
          claims: applyClaimBornAtChanges(page.claims, pageChanges, {
            pageCreatedAt: page.createdAt,
            now
          })
        }
      });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scope: { userId: userId || 'all' },
    scanned: { pages: pages.length, claims: pages.reduce((count, page) => count + (page.claims || []).length, 0) },
    changes
  }, null, 2));
};

main()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    try { await mongoose.disconnect(); } catch (_disconnectError) { /* surface original */ }
    console.error(error);
    process.exit(1);
  });
