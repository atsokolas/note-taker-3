const assert = require('assert');
const {
  assertRepoClaimContinuity,
  receiptIdFor,
  repoCohortIdentity,
  repoCohortReceiptId,
  settleRepoClaimCohort,
  __testables
} = require('./wikiClaimDispositionService');
const { semanticClaim } = require('./claimRevisionReviewService');
const { serializeStoredReceipt } = require('./noeisReceiptService');
const { snapshotContentHash } = require('./wikiRevisionService');

const clone = value => JSON.parse(JSON.stringify(value));
const sameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');
class Query {
  constructor(value) { this.value = value; }
  session() { return this; }
  select() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const fixture = () => {
  const ids = {
    user: '507f191e810c19729de87001',
    page: '507f191e810c19729de87002',
    revision: '507f191e810c19729de87003',
    snapshot: '507f191e810c19729de87004',
    document: '507f191e810c19729de87005',
    run: '507f191e810c19729de87006',
    source: '507f191e810c19729de87007'
  };
  const page = {
    _id: ids.page,
    userId: ids.user,
    pageType: 'repo',
    title: 'atsokolas/note-taker-3',
    claims: [{ claimId: 'claim-1', text: 'Trusted claim.' }],
    sourceRefs: [],
    citations: [],
    externalWatches: {
      githubRepo: {
        owner: 'atsokolas', repo: 'note-taker-3', publishedHeadSha: 'base-head'
      }
    }
  };
  const before = clone(page);
  const baseHash = snapshotContentHash(before);
  const revision = {
    _id: ids.revision,
    userId: ids.user,
    pageId: ids.page,
    sourceEventId: ids.snapshot,
    maintenanceRunId: ids.run,
    before,
    sourceVersion: {
      provider: 'github',
      baseHeadSha: 'base-head',
      headSha: 'candidate-head',
      snapshotKey: 'github-snapshot:atsokolas/note-taker-3:candidate-head',
      owner: 'atsokolas',
      repo: 'note-taker-3',
      cohortId: 'cohort-1',
      cohortClaimIds: ['claim-1'],
      cohortClaimCount: 1,
      trustedHeadHash: baseHash
    },
    claimReview: { targetClaimId: 'claim-1', basePageHash: baseHash }
  };
  const snapshot = {
    _id: ids.snapshot,
    userId: ids.user,
    provider: 'github-repo-snapshot',
    status: 'processed',
    affectedPageIds: [ids.page],
    metadata: {
      pageId: ids.page,
      owner: 'atsokolas',
      repo: 'note-taker-3',
      commitSha: 'candidate-head',
      snapshotKey: revision.sourceVersion.snapshotKey,
      documentEventIds: [ids.document]
    }
  };
  const document = {
    _id: ids.document,
    userId: ids.user,
    provider: 'github-repo',
    affectedPageIds: [ids.page],
    metadata: {
      pageId: ids.page,
      owner: 'atsokolas',
      repo: 'note-taker-3',
      commitSha: 'candidate-head',
      snapshotKey: revision.sourceVersion.snapshotKey
    }
  };
  const validation = {
    newlyLinkedSourceRefs: [{
      _id: ids.source,
      type: 'external',
      objectId: ids.document,
      provider: 'github-repo'
    }]
  };
  const models = () => ({
    findOne: query => new Query(sameId(query._id, snapshot._id) && sameId(query.userId, snapshot.userId) ? snapshot : null),
    find: query => new Query(
      query?._id?.$in?.some(value => sameId(value, document._id)) && sameId(query.userId, document.userId)
        ? [document]
        : []
    )
  });
  return { ids, page, revision, snapshot, document, validation, WikiSourceEvent: models() };
};

const verify = data => assertRepoClaimContinuity({
  page: data.page,
  revision: data.revision,
  validation: data.validation,
  userId: data.ids.user,
  WikiSourceEvent: data.WikiSourceEvent
});

const settledFixture = () => {
  const data = fixture();
  const completedAt = '2026-08-01T18:00:00.000Z';
  data.revision.reason = 'agent_candidate';
  data.revision.after = clone(data.revision.before);
  data.revision.after.claims[0].text = 'Accepted candidate claim.';
  data.revision.claimReview = {
    version: 1,
    scope: 'claim',
    targetClaimId: 'claim-1',
    state: 'accepted',
    basePageHash: data.revision.sourceVersion.trustedHeadHash,
    baseClaimHash: __testables.digest(semanticClaim(data.revision.before.claims[0])),
    proposedClaimHash: __testables.digest(semanticClaim(data.revision.after.claims[0])),
    proposedClaim: clone(data.revision.after.claims[0]),
    bodyPatch: null,
    reviewedAt: completedAt,
    deferredUntil: null,
    events: []
  };
  data.revision.promotionStatus = 'promoted';
  const dispositionId = receiptIdFor(data.ids.revision, 'accept');
  const dispositionReceipt = {
    userId: data.ids.user,
    receiptId: dispositionId,
    kind: 'wiki_claim_disposition',
    source: 'wiki',
    status: 'completed',
    title: 'Accept claim revision',
    summary: 'Human owner chose to accept the proposed claim revision.',
    touched: [
      { type: 'wiki_page', id: data.ids.page, title: data.page.title },
      { type: 'wiki_revision', id: data.ids.revision, title: 'Repo claim revision' }
    ],
    provenance: {
      version: 1,
      action: 'accept',
      revisionId: data.ids.revision,
      pageId: data.ids.page,
      sourceEventId: data.ids.snapshot,
      maintenanceRunId: data.ids.run,
      retainedCandidateHash: __testables.retainedCandidateHash(data.revision),
      claimId: 'claim-1',
      basePageHash: data.revision.claimReview.basePageHash,
      conceptId: null,
      noteHash: __testables.digest(''),
      baseClaimHash: data.revision.claimReview.baseClaimHash,
      proposedClaimHash: data.revision.claimReview.proposedClaimHash,
      bodyPatch: null,
      deferredUntil: null
    },
    completedAt
  };
  data.revision.claimReview.events.push({
    action: 'accept',
    at: completedAt,
    note: '',
    deferredUntil: null,
    receiptId: dispositionId
  });
  data.revision.claimReview.receipt = serializeStoredReceipt(dispositionReceipt);
  data.page.claims = clone(data.revision.after.claims);
  data.page.externalWatches.githubRepo = {
    ...data.page.externalWatches.githubRepo,
    publishedHeadSha: 'candidate-head',
    candidateHeadSha: '',
    buildStatus: 'ready',
    lastPublishedAt: completedAt
  };
  data.page.aiState = { candidateStatus: 'accepted' };
  data.page.freshness = {
    status: 'fresh',
    lastMaintainedAt: completedAt,
    pendingSourceEventIds: [],
    acceptedThrough: {
      sourceEventId: data.ids.snapshot,
      provider: data.snapshot.provider,
      externalId: '',
      title: '',
      url: '',
      sourceUpdatedAt: completedAt,
      acceptedAt: completedAt
    }
  };
  const cohort = repoCohortIdentity(data.revision);
  const cohortId = repoCohortReceiptId(cohort);
  const member = {
    claimId: 'claim-1',
    revisionId: data.ids.revision,
    action: 'accept',
    dispositionReceiptId: dispositionId,
    baseClaimHash: data.revision.claimReview.baseClaimHash,
    proposedClaimHash: data.revision.claimReview.proposedClaimHash
  };
  const cohortReceipt = {
    userId: data.ids.user,
    receiptId: cohortId,
    kind: 'repo_wiki_claim_cohort_accepted',
    source: 'wiki',
    status: 'completed',
    touched: [
      { type: 'wiki_page', id: data.ids.page, title: data.page.title },
      { type: 'wiki_revision', id: data.ids.revision, title: 'Repo claim revision' }
    ],
    provenance: {
      version: 1,
      pageId: data.ids.page,
      sourceEventId: data.ids.snapshot,
      maintenanceRunId: data.ids.run,
      baseHeadSha: 'base-head',
      candidateHeadSha: 'candidate-head',
      snapshotKey: data.revision.sourceVersion.snapshotKey,
      owner: 'atsokolas',
      repo: 'note-taker-3',
      trustedHeadHash: data.revision.sourceVersion.trustedHeadHash,
      revisionIds: [data.ids.revision],
      claimIds: ['claim-1'],
      members: [member],
      assembledPageHash: snapshotContentHash(data.page)
    },
    completedAt
  };
  const receipts = [dispositionReceipt, cohortReceipt];
  const WikiRevision = { find: () => new Query([data.revision]) };
  const NoeisReceipt = {
    findOne: query => {
      const row = receipts.find(receipt => sameId(receipt.userId, query.userId)
        && receipt.receiptId === query.receiptId);
      return new Query(row ? clone(row) : null);
    }
  };
  return { ...data, cohort, receipts, dispositionReceipt, cohortReceipt, WikiRevision, NoeisReceipt };
};

(async () => {
  const valid = fixture();
  const result = await verify(valid);
  assert.strictEqual(result.cohort.candidateHeadSha, 'candidate-head');
  assert.strictEqual(repoCohortIdentity(valid.revision).baseHeadSha, 'base-head');
  assert.match(repoCohortReceiptId(result.cohort), /repo-wiki-claim-cohort:v1/);

  const missingBase = fixture();
  missingBase.revision.sourceVersion.baseHeadSha = '';
  await assert.rejects(() => verify(missingBase), error => error.code === 'repo_provenance_incomplete');

  const staleHead = fixture();
  staleHead.page.externalWatches.githubRepo.publishedHeadSha = 'other-head';
  await assert.rejects(() => verify(staleHead), error => error.code === 'stale_repo_head');

  const stalePage = fixture();
  stalePage.page.title = 'Human-edited title after candidate creation';
  await assert.rejects(() => verify(stalePage), error => error.code === 'stale_repo_page');

  const wrongSnapshot = fixture();
  wrongSnapshot.snapshot.metadata.snapshotKey = 'another-snapshot';
  await assert.rejects(() => verify(wrongSnapshot), error => error.code === 'repo_event_mismatch');

  const unlistedDocument = fixture();
  unlistedDocument.snapshot.metadata.documentEventIds = [];
  await assert.rejects(() => verify(unlistedDocument), error => error.code === 'repo_evidence_unresolved');

  const foreignDocument = fixture();
  foreignDocument.document.userId = '507f191e810c19729de87999';
  await assert.rejects(() => verify(foreignDocument), error => error.code === 'repo_evidence_unresolved');

  const genericExternal = fixture();
  genericExternal.validation.newlyLinkedSourceRefs[0].provider = 'web';
  await assert.rejects(() => verify(genericExternal), error => error.code === 'repo_evidence_unresolved');

  const newerHead = fixture();
  newerHead.page.externalWatches.githubRepo.lastHeadSha = 'newer-head';
  await assert.rejects(() => verify(newerHead), error => error.code === 'newer_repo_head');

  const partial = fixture();
  partial.revision.sourceVersion.cohortClaimIds = ['claim-1', 'claim-2'];
  partial.revision.sourceVersion.cohortClaimCount = 2;
  const PartialRevision = { find: () => new Query([partial.revision]) };
  await assert.rejects(() => settleRepoClaimCohort({
    page: partial.page,
    revision: partial.revision,
    sourceEvent: partial.snapshot,
    userId: partial.ids.user,
    WikiRevision: PartialRevision,
    NoeisReceipt: { findOne: () => new Query(null) },
    now: new Date('2026-08-01T18:00:00.000Z')
  }), error => error.code === 'repo_cohort_incomplete');

  const duplicate = fixture();
  duplicate.revision.sourceVersion.cohortClaimIds = ['claim-1', 'claim-2'];
  duplicate.revision.sourceVersion.cohortClaimCount = 2;
  const DuplicateRevision = { find: () => new Query([duplicate.revision, clone(duplicate.revision)]) };
  await assert.rejects(() => settleRepoClaimCohort({
    page: duplicate.page,
    revision: duplicate.revision,
    sourceEvent: duplicate.snapshot,
    userId: duplicate.ids.user,
    WikiRevision: DuplicateRevision,
    NoeisReceipt: { findOne: () => new Query(null) },
    now: new Date('2026-08-01T18:00:00.000Z')
  }), error => error.code === 'repo_cohort_incomplete');

  const rejectedWithNewerHead = fixture();
  rejectedWithNewerHead.page.externalWatches.githubRepo.lastHeadSha = 'newer-head';
  rejectedWithNewerHead.page.externalWatches.githubRepo.candidateHeadSha = 'newer-head';
  rejectedWithNewerHead.page.aiState = {};
  rejectedWithNewerHead.page.freshness = {};
  rejectedWithNewerHead.page.markModified = () => {};
  rejectedWithNewerHead.page.save = async () => rejectedWithNewerHead.page;
  rejectedWithNewerHead.revision.claimReview.state = 'rejected';
  rejectedWithNewerHead.revision.claimReview.receipt = { id: 'reject-receipt' };
  const RejectedRevision = { find: () => new Query([rejectedWithNewerHead.revision]) };
  const rejectedResult = await settleRepoClaimCohort({
    page: rejectedWithNewerHead.page,
    revision: rejectedWithNewerHead.revision,
    sourceEvent: rejectedWithNewerHead.snapshot,
    userId: rejectedWithNewerHead.ids.user,
    WikiRevision: RejectedRevision,
    NoeisReceipt: { findOne: () => new Query(null) },
    now: new Date('2026-08-01T18:00:00.000Z')
  });
  assert.strictEqual(rejectedResult.blocked, 'rejected');
  assert.strictEqual(rejectedWithNewerHead.page.externalWatches.githubRepo.candidateHeadSha, 'newer-head');
  assert.strictEqual(rejectedWithNewerHead.page.externalWatches.githubRepo.buildStatus, 'queued');

  const settled = settledFixture();
  const replay = await settleRepoClaimCohort({
    page: settled.page,
    revision: settled.revision,
    sourceEvent: settled.snapshot,
    userId: settled.ids.user,
    WikiRevision: settled.WikiRevision,
    NoeisReceipt: settled.NoeisReceipt,
    now: new Date('2026-08-02T18:00:00.000Z')
  });
  assert.strictEqual(replay.idempotent, true);
  assert.deepStrictEqual(
    __testables.canonicalCohortMembers([
      { _id: 'revision-b', claimReview: { targetClaimId: 'claim-b', state: 'preserved', baseClaimHash: 'b1', proposedClaimHash: 'b2' } },
      { _id: 'revision-a', claimReview: { targetClaimId: 'claim-a', state: 'accepted', baseClaimHash: 'a1', proposedClaimHash: 'a2' } }
    ]).map(member => member.claimId),
    ['claim-a', 'claim-b']
  );

  const cohortReceiptIndex = settled.receipts.indexOf(settled.cohortReceipt);
  const removedCohortReceipt = settled.receipts.splice(cohortReceiptIndex, 1)[0];
  await assert.rejects(() => settleRepoClaimCohort({
    page: settled.page,
    revision: settled.revision,
    sourceEvent: settled.snapshot,
    userId: settled.ids.user,
    WikiRevision: settled.WikiRevision,
    NoeisReceipt: settled.NoeisReceipt,
    now: new Date('2026-08-02T18:00:00.000Z')
  }), error => error.code === 'repo_cohort_receipt_integrity_failed');
  settled.receipts.splice(cohortReceiptIndex, 0, removedCohortReceipt);

  const assertCohortTamperFails = async mutate => {
    const original = clone(settled.cohortReceipt);
    mutate(settled.cohortReceipt);
    try {
      await assert.rejects(() => settleRepoClaimCohort({
        page: settled.page,
        revision: settled.revision,
        sourceEvent: settled.snapshot,
        userId: settled.ids.user,
        WikiRevision: settled.WikiRevision,
        NoeisReceipt: settled.NoeisReceipt,
        now: new Date('2026-08-02T18:00:00.000Z')
      }), error => error.code === 'repo_cohort_receipt_integrity_failed');
    } finally {
      Object.keys(settled.cohortReceipt).forEach(key => delete settled.cohortReceipt[key]);
      Object.assign(settled.cohortReceipt, original);
    }
  };
  for (const mutate of [
    receipt => { receipt.kind = 'wrong_kind'; },
    receipt => { receipt.status = 'draft'; },
    receipt => { delete receipt.completedAt; },
    receipt => { receipt.provenance.pageId = 'foreign-page'; },
    receipt => { receipt.provenance.sourceEventId = 'foreign-event'; },
    receipt => { receipt.provenance.candidateHeadSha = 'foreign-head'; },
    receipt => { receipt.provenance.members[0].revisionId = 'foreign-revision'; },
    receipt => { receipt.provenance.assembledPageHash = 'tampered'; },
    receipt => { receipt.touched = []; },
    receipt => { receipt.touched.push({ type: 'other', id: 'foreign' }); }
  ]) await assertCohortTamperFails(mutate);

  const originalDisposition = clone(settled.dispositionReceipt);
  settled.dispositionReceipt.provenance.proposedClaimHash = 'tampered';
  await assert.rejects(() => settleRepoClaimCohort({
    page: settled.page,
    revision: settled.revision,
    sourceEvent: settled.snapshot,
    userId: settled.ids.user,
    WikiRevision: settled.WikiRevision,
    NoeisReceipt: settled.NoeisReceipt,
    now: new Date('2026-08-02T18:00:00.000Z')
  }), error => error.code === 'claim_receipt_integrity_failed');
  Object.keys(settled.dispositionReceipt).forEach(key => delete settled.dispositionReceipt[key]);
  Object.assign(settled.dispositionReceipt, originalDisposition);

  const originalPublishedHead = settled.page.externalWatches.githubRepo.publishedHeadSha;
  settled.page.externalWatches.githubRepo.publishedHeadSha = 'foreign-head';
  await assert.rejects(() => settleRepoClaimCohort({
    page: settled.page,
    revision: settled.revision,
    sourceEvent: settled.snapshot,
    userId: settled.ids.user,
    WikiRevision: settled.WikiRevision,
    NoeisReceipt: settled.NoeisReceipt,
    now: new Date('2026-08-02T18:00:00.000Z')
  }), error => error.code === 'repo_cohort_receipt_integrity_failed');
  settled.page.externalWatches.githubRepo.publishedHeadSha = originalPublishedHead;

  settled.page.externalWatches.githubRepo.lastHeadSha = 'newer-head';
  await assert.rejects(() => settleRepoClaimCohort({
    page: settled.page,
    revision: settled.revision,
    sourceEvent: settled.snapshot,
    userId: settled.ids.user,
    WikiRevision: settled.WikiRevision,
    NoeisReceipt: settled.NoeisReceipt,
    now: new Date('2026-08-02T18:00:00.000Z')
  }), error => error.code === 'repo_cohort_receipt_integrity_failed');
  delete settled.page.externalWatches.githubRepo.lastHeadSha;

  const originalAcceptedThrough = settled.page.freshness.acceptedThrough.sourceEventId;
  settled.page.freshness.acceptedThrough.sourceEventId = 'foreign-event';
  await assert.rejects(() => settleRepoClaimCohort({
    page: settled.page,
    revision: settled.revision,
    sourceEvent: settled.snapshot,
    userId: settled.ids.user,
    WikiRevision: settled.WikiRevision,
    NoeisReceipt: settled.NoeisReceipt,
    now: new Date('2026-08-02T18:00:00.000Z')
  }), error => error.code === 'repo_cohort_receipt_integrity_failed');
  settled.page.freshness.acceptedThrough.sourceEventId = originalAcceptedThrough;

  const originalPromotion = settled.revision.promotionStatus;
  settled.revision.promotionStatus = 'candidate';
  await assert.rejects(() => settleRepoClaimCohort({
    page: settled.page,
    revision: settled.revision,
    sourceEvent: settled.snapshot,
    userId: settled.ids.user,
    WikiRevision: settled.WikiRevision,
    NoeisReceipt: settled.NoeisReceipt,
    now: new Date('2026-08-02T18:00:00.000Z')
  }), error => error.code === 'repo_cohort_receipt_integrity_failed');
  settled.revision.promotionStatus = originalPromotion;

  console.log('wikiRepoClaimDispositionPolicy tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
