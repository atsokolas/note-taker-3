#!/usr/bin/env node
const mongoose = require('mongoose');
const {
  WikiPage,
  WikiRevision
} = require('../server/models');
const {
  createWikiRevision,
  restorePageSnapshot,
  snapshotPage
} = require('../server/services/wikiRevisionService');
const { buildPublicProofHeadHash } = require('../server/services/publicProofHeadService');

const PAGE_ID = '6a5d225cd00276de99a7d168';
const ACCEPTED_REVISION_ID = '6a5d734bc7c994027bab8721';
const CONTAMINATION_PATTERN = /Martin Picard|Mitochondrial Theory of Mind|quantamagazine\.org/i;
const APPLY = process.argv.includes('--apply');

const summarize = (value = {}) => ({
  title: value.title || '',
  status: value.status || '',
  visibility: value.visibility || '',
  words: String(value.plainText || '').trim().split(/\s+/).filter(Boolean).length,
  sources: Array.isArray(value.sourceRefs) ? value.sourceRefs.length : 0,
  claims: Array.isArray(value.claims) ? value.claims.length : 0,
  contaminated: CONTAMINATION_PATTERN.test(JSON.stringify({
    plainText: value.plainText,
    sourceRefs: value.sourceRefs
  })),
  headHash: buildPublicProofHeadHash(value),
  acceptedHeadHash: value.publicProof?.acceptanceSnapshot?.headContentHash || ''
});

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const [page, acceptedRevision] = await Promise.all([
    WikiPage.findById(PAGE_ID),
    WikiRevision.findOne({ _id: ACCEPTED_REVISION_ID, pageId: PAGE_ID }).lean()
  ]);
  if (!page) throw new Error('NVIDIA proof page not found.');
  if (!acceptedRevision?.after) throw new Error('Accepted NVIDIA Push 3 revision snapshot not found.');

  const before = snapshotPage(page);
  const acceptedPublicProof = before.publicProof || {};
  const target = {
    ...acceptedRevision.after,
    publicProof: acceptedPublicProof
  };
  const beforeSummary = summarize(before);
  const targetSummary = summarize(target);
  if (targetSummary.contaminated) throw new Error('Refusing to restore a contaminated target snapshot.');
  if (targetSummary.headHash !== acceptedPublicProof?.acceptanceSnapshot?.headContentHash) {
    throw new Error('Accepted target revision does not match its exact-head acceptance hash.');
  }

  if (beforeSummary.headHash === targetSummary.headHash && !beforeSummary.contaminated) {
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', idempotent: true, page: beforeSummary }, null, 2));
    return;
  }
  if (!beforeSummary.contaminated) {
    throw new Error('Current page does not match the known contamination signature; refusing an unscoped overwrite.');
  }

  const result = {
    mode: APPLY ? 'apply' : 'dry-run',
    idempotent: false,
    pageId: PAGE_ID,
    acceptedRevisionId: ACCEPTED_REVISION_ID,
    before: beforeSummary,
    after: targetSummary
  };
  if (!APPLY) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  restorePageSnapshot(page, target);
  page.lastReviewedAt = acceptedRevision.createdAt;
  page.markModified('lastReviewedAt');
  await page.save();
  const recoveryRevision = await createWikiRevision({
    WikiRevision,
    userId: page.userId,
    page,
    before,
    reason: 'user_edit',
    actorType: 'user',
    summary: 'Restored the explicitly accepted NVIDIA Push 3 head after an unrelated library source event overwrote the public proof object.'
  });
  const restored = snapshotPage(page);
  const restoredSummary = summarize(restored);
  if (restoredSummary.contaminated || restoredSummary.headHash !== targetSummary.headHash) {
    throw new Error('Post-restore NVIDIA proof invariants failed.');
  }
  console.log(JSON.stringify({
    ...result,
    recoveryRevisionId: String(recoveryRevision?._id || ''),
    restored: restoredSummary
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
  });
