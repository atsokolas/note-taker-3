const assert = require('assert');
const mongoose = require('mongoose');
const {
  JudgmentResolutionError,
  recordVerdict,
  setResolutionCriteria
} = require('./judgmentResolutionService');

const USER_ID = '64f500000000000000000001';
const PAGE_ID = '64f500000000000000000010';
const SOURCE_ID = '64f500000000000000000020';
const CLAIM = 'The cost advantage will persist.';
const receipts = new Map();
const revisions = [];

class Query {
  constructor(value) { this.value = value; }
  session() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const page = {
  _id: PAGE_ID,
  userId: USER_ID,
  title: 'Cost advantage',
  status: 'draft',
  createdAt: new Date('2026-01-01T12:00:00Z'),
  sourceRefs: [{ _id: SOURCE_ID }],
  claims: [], citations: [], body: null, plainText: '',
  judgment: {
    currentJudgment: CLAIM,
    bornAt: null,
    resolutionCriteria: '',
    resolutionHorizonAt: null,
    resolutionSetAt: null,
    resolutionHistory: [],
    verdicts: []
  },
  markModified() {},
  async save() { return this; },
  toObject() { return JSON.parse(JSON.stringify(this, (key, value) => typeof value === 'function' ? undefined : value)); }
};

function WikiRevision(data) { Object.assign(this, data); }
WikiRevision.db = { base: mongoose };
WikiRevision.prototype.save = async function save() { revisions.push(this); return this; };
WikiRevision.findOne = query => new Query(revisions.find(revision => (
  String(revision._id) === String(query._id)
  && String(revision.userId) === String(query.userId)
  && String(revision.pageId) === String(query.pageId)
)) || null);
const session = { async withTransaction(run) { await run(); }, async endSession() {} };
const WikiPage = {
  db: { startSession: async () => session },
  findOne: query => new Query(String(query._id) === PAGE_ID && String(query.userId) === USER_ID ? page : null)
};
const NoeisReceipt = {
  findOne: query => new Query(receipts.get(query.receiptId) || null),
  findOneAndUpdate: async (query, update) => {
    const stored = { ...update.$set, receiptId: query.receiptId };
    receipts.set(query.receiptId, stored);
    return stored;
  }
};
const models = { WikiPage, WikiRevision, NoeisReceipt };

(async () => {
  const clock = () => new Date('2026-08-31T12:00:00.000Z');
  const criteria = await setResolutionCriteria({
    ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'criteria-1', expectedClaim: CLAIM,
    criteria: 'Gross margin falls below 40% for two quarters.', horizonAt: '2027-01-01T12:00:00.000Z', now: clock
  });
  assert.strictEqual(criteria.idempotent, false);
  assert.strictEqual(page.judgment.resolutionHistory.length, 1);
  assert.strictEqual(page.judgment.bornAt.toISOString(), '2026-01-01T12:00:00.000Z');
  assert.strictEqual(revisions.length, 1);
  assert.strictEqual(receipts.size, 1);

  const replay = await setResolutionCriteria({
    ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'criteria-1', expectedClaim: CLAIM,
    criteria: 'Gross margin falls below 40% for two quarters.', horizonAt: '2027-01-01T12:00:00.000Z', now: clock
  });
  assert.strictEqual(replay.idempotent, true);
  assert.strictEqual(page.judgment.resolutionHistory.length, 1);

  const criteriaRevision = revisions[0];
  const preservedCriteriaAfter = criteriaRevision.after;
  criteriaRevision.after = {
    ...criteriaRevision.after,
    judgment: { ...criteriaRevision.after.judgment, resolutionHistory: [] }
  };
  await assert.rejects(
    () => setResolutionCriteria({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'criteria-1', expectedClaim: CLAIM,
      criteria: 'Gross margin falls below 40% for two quarters.', horizonAt: '2027-01-01T12:00:00.000Z', now: clock
    }),
    error => error instanceof JudgmentResolutionError && error.code === 'receipt_integrity_failed'
  );
  criteriaRevision.after = preservedCriteriaAfter;

  await assert.rejects(
    () => setResolutionCriteria({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'criteria-stale', expectedClaim: 'An older sentence.',
      criteria: 'Anything', now: clock
    }),
    error => error instanceof JudgmentResolutionError && error.code === 'stale_claim'
  );

  const verdict = await recordVerdict({
    ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'verdict-1', expectedClaim: CLAIM,
    result: 'partly', note: 'Margins compressed, but not below the threshold.', evidenceSourceRefIds: [SOURCE_ID], now: clock
  });
  assert.strictEqual(verdict.idempotent, false);
  assert.strictEqual(page.judgment.verdicts.length, 1);
  assert.strictEqual(page.judgment.verdicts[0].criteriaSnapshot, page.judgment.resolutionCriteria);
  assert.ok(page.judgment.verdicts[0].recordHash);

  await assert.rejects(
    () => recordVerdict({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'verdict-bad-source', expectedClaim: CLAIM,
      result: 'held_up', evidenceSourceRefIds: ['64f500000000000000000099'], now: clock
    }),
    error => error instanceof JudgmentResolutionError && error.code === 'unresolved_evidence'
  );

  const verdictReceipt = Array.from(receipts.values()).find(row => row.kind === 'judgment_verdict_recorded');
  verdictReceipt.provenance.payloadHash = 'corrupt';
  await assert.rejects(
    () => recordVerdict({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'verdict-1', expectedClaim: CLAIM,
      result: 'partly', note: 'Margins compressed, but not below the threshold.', evidenceSourceRefIds: [SOURCE_ID], now: clock
    }),
    error => error instanceof JudgmentResolutionError && error.code === 'receipt_integrity_failed'
  );

  console.log('judgmentResolutionService tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
