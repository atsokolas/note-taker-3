const test = require('node:test');
const assert = require('node:assert/strict');

const express = require('express');
const { buildWeekendReadingsHandlers, buildWeekendReadingsRouter, statusForError } = require('./weekendReadingsRoutes');
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

test('agent tokens receive 403 on every mutation route before receipts or visibility can change', async () => {
  let modelCalls = 0;
  const app = express();
  app.use(express.json());
  app.use(buildWeekendReadingsRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'owner-user' };
      req.agentToken = { id: 'agent-token-1', label: 'External agent' };
      next();
    },
    WikiPage: {
      findOne: () => { modelCalls += 1; throw new Error('mutation handler must not run'); },
      create: () => { modelCalls += 1; throw new Error('mutation handler must not run'); }
    },
    WikiRevision: {
      findOne: () => { modelCalls += 1; throw new Error('mutation handler must not run'); }
    },
    NoeisReceipt: {
      find: () => { modelCalls += 1; throw new Error('mutation handler must not run'); },
      findOneAndUpdate: () => { modelCalls += 1; throw new Error('mutation handler must not run'); }
    }
  }));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const paths = [
      '/api/wiki/weekend-readings/drafts',
      '/api/wiki/weekend-readings/page-1/review',
      '/api/wiki/weekend-readings/page-1/approve',
      '/api/wiki/weekend-readings/page-1/publish'
    ];
    for (const path of paths) {
      const result = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      assert.equal(result.status, 403, path);
      assert.deepEqual(await result.json(), { error: 'Only the human owner can mutate Weekend Readings.' });
    }
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  assert.equal(modelCalls, 0);
});
