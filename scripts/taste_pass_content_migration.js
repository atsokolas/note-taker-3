#!/usr/bin/env node
/**
 * Taste Pass T2 — dry-run by default.
 *
 * Prints claim/page merge plans and canonical wiki title changes as JSON.
 * Article fragment titles are T3: `scripts/taste_pass_title_hygiene.js`.
 * Does not write unless `--apply --user-id=<id>` is passed. Do not run
 * --apply against production without listing the merged ids from a dry-run first.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { WikiPage } = require('../server/models');
const {
  buildDuplicateClaimPlan,
  buildDuplicatePagePlan,
  mergeClaimRecords,
  mergePageRecords
} = require('../server/services/wikiDedupeService');
const {
  canonicalWikiTitle
} = require('../server/services/wikiPresentationGuard');

const limitFrom = argv => {
  const value = Number(argv.find(arg => arg.startsWith('--limit='))?.split('=')[1]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 20_000) : 5_000;
};

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
  const limit = limitFrom(argv);
  const maxTimeMs = numberArg(argv, '--max-time-ms', 30_000, 120_000);
  const userId = stringArg(argv, '--user-id');
  if (apply && !userId) throw new Error('--apply requires an explicit --user-id.');
  const scope = {
    ...(userId ? { userId } : {})
  };
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: maxTimeMs });
  console.error(`[taste-pass] connected; auditing up to ${limit} wiki pages`);

  const pages = await WikiPage.find({ ...scope, status: { $ne: 'archived' } })
    .select('_id userId title plainText sourceRefs._id claims.claimId claims.text judgment.currentJudgment judgment.why judgment.against judgment.assumptions judgment.unknowns judgment.falsifiers judgment.decisions judgment.lessons judgment.dependsOn aiState.candidateStatus aiState.build externalWatches.githubRepo createdAt updatedAt')
    .limit(limit)
    .maxTimeMS(maxTimeMs)
    .lean();
  console.error(`[taste-pass] scanned ${pages.length} wiki pages`);

  const wikiTitleChanges = pages.map(page => ({
    id: String(page._id),
    userId: String(page.userId || ''),
    before: page.title,
    after: canonicalWikiTitle(page)
  })).filter(change => change.after && change.after !== change.before);

  const duplicatePlans = [];
  const pagesByUser = new Map();
  pages.forEach(page => {
    const userId = String(page.userId || '');
    if (!pagesByUser.has(userId)) pagesByUser.set(userId, []);
    pagesByUser.get(userId).push(page);
  });
  pagesByUser.forEach((userPages, groupedUserId) => duplicatePlans.push(...buildDuplicatePagePlan(
    userPages.map(page => ({
      ...page,
      title: canonicalWikiTitle(page)
    }))
  ).map(plan => ({ ...plan, userId: groupedUserId }))));

  const duplicateClaimMerges = pages.flatMap(page => (
    buildDuplicateClaimPlan(page.claims).map(plan => ({
      pageId: String(page._id),
      userId: String(page.userId || ''),
      ...plan
    }))
  ));

  if (apply) {
    if (wikiTitleChanges.length) {
      await WikiPage.bulkWrite(wikiTitleChanges.map(change => ({
        updateOne: { filter: { _id: change.id }, update: { $set: { title: change.after } } }
      })));
    }
    const mergePageIds = new Set([
      ...duplicateClaimMerges.map(plan => plan.pageId),
      ...duplicatePlans.flatMap(plan => [plan.canonicalId, ...plan.duplicateIds])
    ]);
    const mergePages = mergePageIds.size
      ? await WikiPage.find({ _id: { $in: Array.from(mergePageIds) } })
        .select('_id userId title plainText sourceRefs citations claims judgment aiState createdFrom createdAt updatedAt')
        .maxTimeMS(maxTimeMs)
        .lean()
      : [];
    const mergePageById = new Map(mergePages.map(page => [String(page._id), page]));
    const pagesWithDuplicateClaims = new Set(duplicateClaimMerges.map(plan => plan.pageId));
    for (const page of mergePages.filter(candidate => pagesWithDuplicateClaims.has(String(candidate._id)))) {
      await WikiPage.updateOne({ _id: page._id }, {
        $set: { claims: mergeClaimRecords(page.claims) }
      });
    }
    for (const plan of duplicatePlans) {
      const merged = mergePageRecords(
        [plan.canonicalId, ...plan.duplicateIds].map(pageId => mergePageById.get(pageId)).filter(Boolean),
        { canonicalPage: mergePageById.get(plan.canonicalId) }
      );
      if (!merged) throw new Error(`Could not load duplicate page group ${plan.key}.`);
      await WikiPage.updateOne({ _id: plan.canonicalId }, {
        $set: {
          sourceRefs: merged.sourceRefs,
          citations: merged.citations,
          claims: merged.claims,
          judgment: merged.judgment,
          aiState: merged.aiState
        }
      });
      await WikiPage.updateMany({ _id: { $in: plan.duplicateIds } }, {
        $set: { status: 'archived', archived: true, hiddenFromHome: true }
      });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scope: { userId: userId || 'all' },
    scanned: { pages: pages.length },
    wikiTitleChanges,
    duplicateClaimMerges,
    duplicatePageMerges: duplicatePlans.map(plan => ({
      userId: plan.userId,
      key: plan.key,
      canonicalId: plan.canonicalId,
      mergedIds: plan.duplicateIds
    }))
  }, null, 2));
};

main()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    try { await mongoose.disconnect(); } catch (_disconnectError) { /* surface original */ }
    console.error(error);
    process.exit(1);
  });
