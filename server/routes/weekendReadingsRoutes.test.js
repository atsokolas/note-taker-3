const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWeekendReadingsHandlers, statusForError } = require('./weekendReadingsRoutes');
const {
  APPROVAL_CONFIRMATION,
  PUBLICATION_CONFIRMATION,
  REVIEW_CONFIRMATION
} = require('../services/weekendReadingsApprovalService');
const { weekendReadingsLeakFixture, privateSentinel } = require('../services/fixtures/weekendReadingsLeakFixture');

const response = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

const buildHarness = () => {
  const receipts = [];
  const invalidations = [];
  const page = {
    ...weekendReadingsLeakFixture(),
    saveCount: 0,
    async save() { this.saveCount += 1; return this; }
  };
  const revision = { _id: 'revision-123456789', pageId: page._id, after: weekendReadingsLeakFixture() };
  const NoeisReceipt = {
    find: () => receipts,
    findOne: query => receipts.find(row => (
      (!query.receiptId || row.receiptId === query.receiptId)
      && (!query.kind || row.kind === query.kind)
      && (!query.status || row.status === query.status)
      && (!query['provenance.pageId'] || row.provenance?.pageId === query['provenance.pageId'])
    )) || null,
    findOneAndUpdate: async (_query, update) => {
      const stored = { _id: `receipt-${receipts.length + 1}`, ...update.$set };
      const index = receipts.findIndex(row => row.receiptId === stored.receiptId);
      if (index >= 0) receipts[index] = stored;
      else receipts.push(stored);
      return stored;
    }
  };
  const handlers = buildWeekendReadingsHandlers({
    WikiPage: { findOne: async () => page },
    WikiRevision: { findOne: () => revision },
    NoeisReceipt,
    invalidatePublicPageCache: (...keys) => invalidations.push(keys),
    now: () => new Date('2026-07-19T12:00:00.000Z')
  });
  return { handlers, invalidations, NoeisReceipt, page, receipts, revision };
};

const request = confirmation => ({
  user: { id: 'athan-user' },
  params: { pageId: 'page-private-1' },
  body: { confirmation }
});

test('authenticated handlers keep review and approval private, then publish the exact revision', async () => {
  const harness = buildHarness();
  const reviewRes = response();
  await harness.handlers.requestReview(request(REVIEW_CONFIRMATION), reviewRes);
  assert.equal(reviewRes.statusCode, 200);
  assert.equal(reviewRes.body.approvalState.code, 'review_requested');
  assert.equal(harness.page.visibility, 'private');

  const approvalRes = response();
  await harness.handlers.approve(request(APPROVAL_CONFIRMATION), approvalRes);
  assert.equal(approvalRes.statusCode, 200);
  assert.equal(approvalRes.body.approvalState.code, 'approved');
  assert.equal(harness.page.visibility, 'private');

  const publicationRes = response();
  await harness.handlers.publish(request(PUBLICATION_CONFIRMATION), publicationRes);
  assert.equal(publicationRes.statusCode, 200);
  assert.equal(harness.page.visibility, 'shared');
  assert.equal(harness.page.status, 'published');
  assert.equal(publicationRes.body.publicUrl, '/share/wiki/weekend-readings-2026-07-19');
  assert.deepEqual(harness.invalidations, [['page-private-1', 'weekend-readings-2026-07-19']]);
  assert.equal(harness.receipts.length, 3);
  assert.doesNotMatch(JSON.stringify(publicationRes.body.publicArtifact), new RegExp(privateSentinel));
});

test('missing literal confirmation is a 400 and does not mutate visibility', async () => {
  const harness = buildHarness();
  const res = response();
  await harness.handlers.requestReview(request('yes'), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /requires confirmation/);
  assert.equal(harness.page.visibility, 'private');
  assert.equal(harness.receipts.length, 0);
});

test('publication receipt failure rolls the page back to private draft', async () => {
  const harness = buildHarness();
  await harness.handlers.requestReview(request(REVIEW_CONFIRMATION), response());
  await harness.handlers.approve(request(APPROVAL_CONFIRMATION), response());
  const originalPersist = harness.NoeisReceipt.findOneAndUpdate;
  harness.NoeisReceipt.findOneAndUpdate = async (query, update) => {
    if (update.$set.kind === 'weekend_readings_revision_published') throw new Error('receipt persistence unavailable');
    return originalPersist(query, update);
  };
  const res = response();
  await harness.handlers.publish(request(PUBLICATION_CONFIRMATION), res);
  assert.equal(res.statusCode, 500);
  assert.equal(harness.page.visibility, 'private');
  assert.equal(harness.page.status, 'draft');
  assert.equal(harness.page.saveCount, 2);
  assert.equal(harness.invalidations.length, 0);
});

test('route errors distinguish stale conflicts from validation and internal failures', () => {
  assert.equal(statusForError(new Error('Draft changed after approval; reapproval is required.')), 409);
  assert.equal(statusForError(new Error('confirmation is required')), 400);
  assert.equal(statusForError(new Error('Weekend Readings page not found.')), 404);
  assert.equal(statusForError(new Error('database disconnected')), 500);
});
