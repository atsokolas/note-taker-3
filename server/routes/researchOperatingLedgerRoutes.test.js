const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { buildResearchLedgerEntry } = require('../services/researchOperatingLedgerService');

const THESIS_ID = '507f1f77bcf86cd799439011';
const EVIDENCE_ID = '507f191e810c19729de860ea';
const ARCHIVED_EVIDENCE_ID = '507f191e810c19729de860eb';

const {
  buildResearchOperatingLedgerHandlers,
  buildResearchOperatingLedgerRouter,
  validateLedgerTargets
} = require('./researchOperatingLedgerRoutes');

const request = async (app, { path = '/api/wiki/research-ledger/entries', body = {}, headers = {} } = {}) => {
  const server = app.listen(0);
  try {
    const address = server.address();
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
  } finally {
    server.close();
  }
};

const pageModel = pages => ({
  findOne(query) {
    const page = pages.find(candidate => (
      String(candidate._id) === String(query._id)
      && String(candidate.userId) === String(query.userId)
      && candidate.status !== 'archived'
    ));
    return { lean: async () => page || null };
  }
});

const thesis = () => ({
  _id: THESIS_ID,
  userId: 'athan-user',
  title: 'Industrial Electrification Value Stack — Living Thesis 001',
  status: 'draft',
  visibility: 'private',
  judgment: { kind: 'thesis', claims: [{ id: 'claim-1', text: 'Human-authored claim' }] }
});

const validBody = () => ({
  thesisPageId: THESIS_ID,
  month: '2026-07',
  phase: 'frame',
  status: 'completed',
  summary: 'Athan framed the question and recorded the prior.',
  evidencePageIds: [EVIDENCE_ID],
  unknowns: ['What captures the value?'],
  nextAction: 'Bound the evidence search.'
});

test('human route records a private ledger entry using canonical thesis identity without mutating the thesis', async () => {
  const livingThesis = thesis();
  const before = structuredClone(livingThesis);
  let observed = null;
  const app = express();
  app.use(express.json());
  app.use(buildResearchOperatingLedgerRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'athan-user' }; next(); },
    WikiPage: pageModel([livingThesis, { _id: EVIDENCE_ID, userId: 'athan-user', status: 'draft' }]),
    WikiRevision: {},
    NoeisReceipt: {},
    buildUniqueSlug: async () => 'unused',
    now: () => new Date('2026-07-20T15:00:00.000Z'),
    persistEntry: async input => {
      observed = input;
      return {
        created: true,
        idempotent: false,
        page: { _id: 'ledger-page-1' },
        revision: { _id: 'ledger-revision-1' },
        entry: { phase: input.phase, recordedAt: input.recordedAt.toISOString() },
        receipt: { receiptId: 'ledger-receipt-1' }
      };
    }
  }));

  const response = await request(app, { body: { ...validBody(), thesisTitle: 'Spoofed title', recordedAt: '1999-01-01' } });
  assert.equal(response.status, 201);
  assert.equal(observed.userId, 'athan-user');
  assert.equal(observed.thesisTitle, livingThesis.title);
  assert.equal(observed.recordedAt.toISOString(), '2026-07-20T15:00:00.000Z');
  assert.deepEqual(observed.evidencePageIds, [EVIDENCE_ID]);
  assert.deepEqual(livingThesis, before);
});

test('agent token receives 403 before any page lookup or ledger mutation', async () => {
  let pageLookups = 0;
  let writes = 0;
  const app = express();
  app.use(express.json());
  app.use(buildResearchOperatingLedgerRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'athan-user' };
      req.agentToken = { id: 'agent-token-1' };
      next();
    },
    WikiPage: { findOne() { pageLookups += 1; return { lean: async () => null }; } },
    persistEntry: async () => { writes += 1; }
  }));

  const response = await request(app, { body: validBody() });
  assert.equal(response.status, 403);
  assert.equal(pageLookups, 0);
  assert.equal(writes, 0);
});

test('non-thesis and cross-owner evidence targets fail closed without persistence', async () => {
  let writes = 0;
  const persistEntry = async () => { writes += 1; };

  const nonThesisHandler = buildResearchOperatingLedgerHandlers({
    WikiPage: pageModel([{ ...thesis(), judgment: null }]),
    persistEntry
  }).recordEntry;
  const responses = [];
  await nonThesisHandler(
    { user: { id: 'athan-user' }, body: validBody() },
    { status(code) { this.code = code; return this; }, json(body) { responses.push({ code: this.code, body }); return this; } }
  );
  assert.equal(responses[0].code, 400);
  assert.match(responses[0].body.error, /living thesis/i);

  const crossOwnerHandler = buildResearchOperatingLedgerHandlers({
    WikiPage: pageModel([thesis(), { _id: EVIDENCE_ID, userId: 'another-user', status: 'draft' }]),
    persistEntry
  }).recordEntry;
  await crossOwnerHandler(
    { user: { id: 'athan-user' }, body: validBody() },
    { status(code) { this.code = code; return this; }, json(body) { responses.push({ code: this.code, body }); return this; } }
  );
  assert.equal(responses[1].code, 400);
  assert.match(responses[1].body.error, /human owner/i);
  assert.equal(writes, 0);
});

test('target validation deduplicates evidence pages and rejects archived pages', async () => {
  const WikiPage = pageModel([
    thesis(),
    { _id: EVIDENCE_ID, userId: 'athan-user', status: 'draft' },
    { _id: ARCHIVED_EVIDENCE_ID, userId: 'athan-user', status: 'archived' }
  ]);
  const valid = await validateLedgerTargets({
    WikiPage,
    userId: 'athan-user',
    thesisPageId: THESIS_ID,
    evidencePageIds: [EVIDENCE_ID, EVIDENCE_ID]
  });
  assert.deepEqual(valid.evidencePageIds, [EVIDENCE_ID]);
  await assert.rejects(() => validateLedgerTargets({
    WikiPage,
    userId: 'athan-user',
    thesisPageId: THESIS_ID,
    evidencePageIds: [ARCHIVED_EVIDENCE_ID]
  }), /human owner and remain active/);
});

test('malformed thesis and evidence ids fail before database lookup', async () => {
  let pageLookups = 0;
  const WikiPage = { findOne() { pageLookups += 1; return { lean: async () => null }; } };
  await assert.rejects(() => validateLedgerTargets({
    WikiPage,
    userId: 'athan-user',
    thesisPageId: 'not-an-object-id'
  }), /Invalid living thesis page id/);
  await assert.rejects(() => validateLedgerTargets({
    WikiPage,
    userId: 'athan-user',
    thesisPageId: THESIS_ID,
    evidencePageIds: 'not-an-array'
  }), /must be an array/);
  assert.equal(pageLookups, 0);
});

test('route reports idempotency conflict as 409 and malformed ledger arrays as 400', async () => {
  const pages = pageModel([thesis(), { _id: EVIDENCE_ID, userId: 'athan-user', status: 'draft' }]);
  const respond = () => ({
    code: 0,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  });
  const conflict = new Error('Research-ledger idempotency key already exists with different content.');
  conflict.code = 'RESEARCH_LEDGER_IDEMPOTENCY_CONFLICT';
  const conflictHandler = buildResearchOperatingLedgerHandlers({
    WikiPage: pages,
    persistEntry: async () => { throw conflict; }
  }).recordEntry;
  const conflictResponse = respond();
  await conflictHandler({ user: { id: 'athan-user' }, body: validBody() }, conflictResponse);
  assert.equal(conflictResponse.code, 409);

  const malformedHandler = buildResearchOperatingLedgerHandlers({
    WikiPage: pages,
    persistEntry: async input => buildResearchLedgerEntry(input)
  }).recordEntry;
  const malformedResponse = respond();
  await malformedHandler({
    user: { id: 'athan-user' },
    body: { ...validBody(), unknowns: 'not-an-array' }
  }, malformedResponse);
  assert.equal(malformedResponse.code, 400);
  assert.match(malformedResponse.body.error, /unknowns must be an array/);
});
