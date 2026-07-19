const test = require('node:test');
const assert = require('node:assert/strict');

const {
  APPROVAL_CONFIRMATION,
  PUBLICATION_CONFIRMATION,
  REVIEW_CONFIRMATION,
  approveWeekendReadingsRevision,
  loadPublishedWeekendReadingsArtifact,
  publishWeekendReadingsRevision,
  requestWeekendReadingsReview
} = require('./weekendReadingsWorkflowService');
const { weekendReadingsLeakFixture, privateSentinel } = require('./fixtures/weekendReadingsLeakFixture');

const buildModels = (receipts = [], overrides = {}) => ({
  WikiPage: {
    findOne: () => ({ _id: 'page-private-1', ...weekendReadingsLeakFixture() })
  },
  WikiRevision: {
    findOne: () => ({ _id: 'revision-123456789', pageId: 'page-private-1', after: weekendReadingsLeakFixture() })
  },
  NoeisReceipt: {
    find: () => receipts,
    findOne: query => receipts.find(row => (
      (!query.receiptId || row.receiptId === query.receiptId)
      && (!query.kind || row.kind === query.kind)
      && (!query.status || row.status === query.status)
      && (!query['provenance.pageId'] || row.provenance?.pageId === query['provenance.pageId'])
    )) || null
  },
  ...overrides
});

const persistInto = receipts => async ({ receipt }) => {
  const stored = { ...receipt, receiptId: receipt.id };
  receipts.push(stored);
  return receipt;
};

test('workflow persists review, approval, and publication as deterministic receipts', async () => {
  const receipts = [];
  const models = buildModels(receipts);
  const persistReceipt = persistInto(receipts);
  const review = await requestWeekendReadingsReview({
    models,
    userId: 'athan-user',
    pageId: 'page-private-1',
    confirmation: REVIEW_CONFIRMATION,
    now: '2026-07-19T12:00:00.000Z',
    persistReceipt
  });
  assert.equal(review.state.code, 'review_requested');
  assert.match(review.receipt.id, /:review:revision-123456789$/);

  const approval = await approveWeekendReadingsRevision({
    models,
    userId: 'athan-user',
    pageId: 'page-private-1',
    confirmation: APPROVAL_CONFIRMATION,
    now: '2026-07-19T12:05:00.000Z',
    persistReceipt
  });
  assert.equal(approval.state.code, 'approved');
  assert.match(approval.receipt.id, /:approval:revision-123456789$/);

  const publication = await publishWeekendReadingsRevision({
    models,
    userId: 'athan-user',
    pageId: 'page-private-1',
    confirmation: PUBLICATION_CONFIRMATION,
    now: '2026-07-19T12:10:00.000Z',
    persistReceipt
  });
  assert.equal(publication.state.code, 'published');
  assert.equal(publication.publicArtifact.publication.approvedRevisionId, 'revision-123456789');
  assert.equal(receipts.length, 3);
  assert.doesNotMatch(JSON.stringify(publication.publicArtifact), new RegExp(privateSentinel));
});

test('approval fails closed without a review receipt for the current revision', async () => {
  await assert.rejects(() => approveWeekendReadingsRevision({
    models: buildModels([]),
    userId: 'athan-user',
    pageId: 'page-private-1',
    confirmation: APPROVAL_CONFIRMATION,
    persistReceipt: async () => null
  }), /review request for the same exact revision/);
});

test('workflow refuses pruned revision snapshots', async () => {
  const models = buildModels([], {
    WikiRevision: {
      findOne: () => ({ _id: 'revision-pruned', snapshotPrunedAt: new Date(), after: weekendReadingsLeakFixture() })
    }
  });
  await assert.rejects(() => requestWeekendReadingsReview({
    models,
    userId: 'athan-user',
    pageId: 'page-private-1',
    confirmation: REVIEW_CONFIRMATION
  }), /snapshot is unavailable/);
});

test('public loader returns only a shared published page with matching approval receipts', async () => {
  const receipts = [];
  const models = buildModels(receipts);
  const persistReceipt = persistInto(receipts);
  await requestWeekendReadingsReview({ models, userId: 'athan-user', pageId: 'page-private-1', confirmation: REVIEW_CONFIRMATION, persistReceipt });
  await approveWeekendReadingsRevision({ models, userId: 'athan-user', pageId: 'page-private-1', confirmation: APPROVAL_CONFIRMATION, persistReceipt });
  await publishWeekendReadingsRevision({ models, userId: 'athan-user', pageId: 'page-private-1', confirmation: PUBLICATION_CONFIRMATION, persistReceipt });

  const page = { _id: 'page-private-1', slug: 'weekend-readings-2026-07-19', visibility: 'shared', status: 'published' };
  const artifact = await loadPublishedWeekendReadingsArtifact({ NoeisReceipt: models.NoeisReceipt, page, ownerUserId: 'athan-user' });
  assert.equal(artifact.title, 'Weekend Readings — 2026-07-19 — Edition 1');
  assert.equal(await loadPublishedWeekendReadingsArtifact({
    NoeisReceipt: models.NoeisReceipt,
    page: { ...page, visibility: 'private' },
    ownerUserId: 'athan-user'
  }), null);
});

test('public loader fails closed when the approval receipt is absent or mismatched', async () => {
  const receipts = [{
    receiptId: 'publication-id',
    kind: 'weekend_readings_revision_published',
    status: 'published',
    provenance: {
      pageId: 'page-private-1',
      approvalReceiptId: 'missing-approval',
      revisionId: 'revision-123456789',
      digest: 'missing'
    }
  }];
  const artifact = await loadPublishedWeekendReadingsArtifact({
    NoeisReceipt: buildModels(receipts).NoeisReceipt,
    page: { _id: 'page-private-1', slug: 'weekend-readings-2026-07-19', visibility: 'shared', status: 'published' },
    ownerUserId: 'athan-user'
  });
  assert.equal(artifact, null);
});
