const mongoose = require('mongoose');
const { clockFact } = require('./judgmentLedger');
const {
  JudgmentLedgerError,
  recordClock,
  recordOutcome,
  resolveLesson
} = require('./judgmentLedgerService');

const USER_ID = '64f500000000000000000001';
const PAGE_ID = '64f500000000000000000010';
const SOURCE_ID = '64f500000000000000000020';
const SOURCE_PAGE = '64f500000000000000000030';
const CLAIM = 'The cost advantage will persist.';

class Query {
  constructor(value) { this.value = value; }
  session() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

function modelsFor(page, receipts = new Map(), revisions = []) {
  function WikiRevision(data) { Object.assign(this, data); }
  WikiRevision.db = { base: mongoose };
  WikiRevision.prototype.save = async function save() { revisions.push(this); return this; };
  WikiRevision.findOne = query => new Query(revisions.find(revision => (
    String(revision._id) === String(query._id)
    && String(revision.userId) === String(query.userId)
    && String(revision.pageId) === String(query.pageId)
  )) || null);
  const session = { async withTransaction(run) { await run(); }, async endSession() {} };
  return {
    WikiPage: {
      db: { startSession: async () => session },
      findOne: query => new Query(String(query._id) === PAGE_ID && String(query.userId) === USER_ID ? page : null)
    },
    WikiRevision,
    NoeisReceipt: {
      findOne: query => new Query(receipts.get(query.receiptId) || null),
      findOneAndUpdate: async (query, update) => {
        const stored = { ...update.$set, receiptId: query.receiptId };
        receipts.set(query.receiptId, stored);
        return stored;
      }
    },
    receipts,
    revisions
  };
}

const pageOf = () => ({
  _id: PAGE_ID,
  userId: USER_ID,
  title: 'Cost advantage',
  status: 'draft',
  createdAt: new Date('2026-01-01T12:00:00Z'),
  sourceRefs: [{ _id: SOURCE_ID }],
  claims: [], citations: [], body: null, plainText: '',
  judgment: {
    currentJudgment: CLAIM,
    bornAt: new Date('2026-01-01T12:00:00Z'),
    clocks: [],
    outcomes: [],
    lessons: [{ lessonId: 'keep-me', text: 'Original lesson.', at: new Date('2026-02-01T12:00:00Z') }],
    lessonApplications: [],
    verdicts: [{
      verdictId: 'verdict_1',
      result: 'held_up',
      recordedAt: new Date('2026-08-01T12:00:00Z'),
      note: '',
      evidenceSourceRefIds: [SOURCE_ID]
    }]
  },
  markModified() {},
  async save() { return this; },
  toObject() { return JSON.parse(JSON.stringify(this, (key, value) => typeof value === 'function' ? undefined : value)); }
});

describe('judgment ledger persistence', () => {
  const now = () => new Date('2026-08-31T12:00:00.000Z');

  it('records late evidence on the evidence clock without rewriting the past', async () => {
    const page = pageOf();
    const models = modelsFor(page);
    const late = await recordClock({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'clock-1', expectedClaim: CLAIM,
      clock: 'evidence', occurredAt: '2026-02-01T12:00:00.000Z', authoredBy: 'world',
      summary: 'A February filing.', sourceRefIds: [SOURCE_ID], now
    });
    expect(late.idempotent).toBe(false);
    expect(page.judgment.clocks[0].clock).toBe('evidence');
    expect(page.judgment.clocks[0].occurredAt.toISOString()).toBe('2026-02-01T12:00:00.000Z');
    expect(page.judgment.clocks[0].recordedAt.toISOString()).toBe('2026-08-31T12:00:00.000Z');

    const replay = await recordClock({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'clock-1', expectedClaim: CLAIM,
      clock: 'evidence', occurredAt: '2026-02-01T12:00:00.000Z', authoredBy: 'world',
      summary: 'A February filing.', sourceRefIds: [SOURCE_ID], now
    });
    expect(replay.idempotent).toBe(true);
    expect(page.judgment.clocks).toHaveLength(1);
  });

  it('records an outcome and a lesson without rewriting the original verdict', async () => {
    const page = pageOf();
    const models = modelsFor(page);
    const outcome = await recordOutcome({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'outcome-1', expectedClaim: CLAIM,
      result: 'held', observedAt: '2026-08-01T12:00:00.000Z', sourceRefIds: [SOURCE_ID],
      answer: 'It held, but the reason was power.', lesson: 'Watch conversion, not announcements.',
      verdictId: 'verdict_1', now
    });
    expect(outcome.idempotent).toBe(false);
    expect(page.judgment.outcomes[0].verdictSnapshot).toBe('held_up');
    expect(page.judgment.verdicts[0].result).toBe('held_up');
    expect(page.judgment.lessons.some((row) => row.text === 'Watch conversion, not announcements.')).toBe(true);
    expect(page.judgment.clocks.some((row) => row.clock === 'outcome')).toBe(true);

    const silent = await recordOutcome({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'outcome-silent', expectedClaim: CLAIM,
      silence: true, verdictId: 'verdict_1', now
    });
    expect(silent.artifact.silence).toBe(true);
    expect(silent.artifact.answer).toBe('');
  });

  it('accepts a lesson onto a live case and leaves the original text untouched', async () => {
    const page = pageOf();
    const models = modelsFor(page);
    const original = page.judgment.lessons.find((row) => row.lessonId === 'keep-me');
    const applied = await resolveLesson({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'lesson-1', expectedClaim: CLAIM,
      lessonId: 'l-power', sourcePageId: SOURCE_PAGE, sourceText: 'Watch conversion, not announcements.',
      status: 'accepted', now
    });
    expect(applied.artifact.status).toBe('accepted');
    expect(original.text).toBe('Original lesson.');
    expect(page.judgment.lessons.find((row) => row.lessonId === 'keep-me').text).toBe('Original lesson.');
  });

  it('refuses a generic activity log clock', async () => {
    const page = pageOf();
    const models = modelsFor(page);
    await expect(recordClock({
      ...models, userId: USER_ID, pageId: PAGE_ID, requestId: 'clock-bad', expectedClaim: CLAIM,
      clock: 'activity', now
    })).rejects.toBeInstanceOf(JudgmentLedgerError);
    void clockFact;
  });
});
