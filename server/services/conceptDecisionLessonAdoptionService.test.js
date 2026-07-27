const assert = require('assert');
const {
  ConceptDecisionLessonAdoptionError,
  adoptDecisionLessonEvidence,
  loadConceptDecisionLessonEvidence,
  payloadHash,
  stableAdoptionId,
  stableReceiptId
} = require('./conceptDecisionLessonAdoptionService');
const { ConceptDecisionLessonEvidence: EvidenceModel } = require('../models');

const USER_ID = '64f600000000000000000001';
const CONCEPT_ID = '64f600000000000000000010';
const PAGE_ID = '64f600000000000000000020';
const DECISION_ID = 'decision_verified';
const LESSON_ID = 'decision_lesson_verified';
const DECISION_HASH = 'a'.repeat(64);
const OUTCOME_HASH = 'b'.repeat(64);

class Query {
  constructor(value) { this.value = value; }
  session() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}
const matches = (row, query = {}) => Object.entries(query).every(([key, expected]) => {
  if (expected && typeof expected === 'object' && Array.isArray(expected.$in)) {
    return expected.$in.some(value => String(value) === String(row?.[key]));
  }
  if (expected && typeof expected === 'object' && Object.hasOwn(expected, '$ne')) {
    return String(row?.[key]) !== String(expected.$ne);
  }
  return String(row?.[key] ?? '') === String(expected ?? '');
});
const canonicalLesson = () => ({
  id: LESSON_ID,
  kind: 'decision_lesson',
  status: 'available_for_review',
  acceptedIntoConcept: false,
  suggestedRole: null,
  lesson: 'Separate utilization from hardware efficiency.',
  observedAt: '2026-07-30T12:00:00.000Z',
  result: 'mixed',
  processScore: 0.8,
  calibrationNote: 'Direction held; magnitude was too broad.',
  decision: { type: 'decision', id: DECISION_ID, title: 'Bounded follow-up' },
  page: { type: 'wiki_page', id: PAGE_ID, title: 'Source Wiki' },
  observedEvidence: [{ type: 'article', id: '64f600000000000000000030', title: 'Observed evidence', href: '/library' }],
  decisionSources: [{ type: 'article', id: '64f600000000000000000031', title: 'Decision source', href: '/library' }],
  relatedClaims: [{ type: 'wiki_claim', id: 'claim-1', parentId: PAGE_ID, title: 'Claim' }],
  relevanceBasis: { type: 'explicit_wiki_investigation', pageId: PAGE_ID },
  provenance: {
    acceptedRevisionId: '64f600000000000000000040',
    recordedRevisionId: '64f600000000000000000041',
    outcomeRevisionId: '64f600000000000000000042',
    decisionReceiptId: 'decision-receipt',
    outcomeReceiptId: 'outcome-receipt',
    immutableSnapshotHash: DECISION_HASH,
    outcomeRecordHash: OUTCOME_HASH
  }
});

const buildHarness = ({ failReceipt = false, transactions = true, sourceVisible = true } = {}) => {
  const state = {
    concepts: [{ _id: CONCEPT_ID, userId: USER_ID, name: 'Target Concept' }],
    adoptions: [],
    receipts: []
  };
  const db = transactions ? {
    startSession: async () => ({
      withTransaction: async fn => {
        const snapshot = JSON.parse(JSON.stringify(state));
        try { await fn(); } catch (error) {
          state.concepts = snapshot.concepts;
          state.adoptions = snapshot.adoptions;
          state.receipts = snapshot.receipts;
          throw error;
        }
      },
      endSession: async () => {}
    })
  } : {};
  const TagMeta = {
    findOne: query => new Query(state.concepts.find(row => matches(row, query)) || null)
  };
  const WikiPage = {
    find: query => new Query((sourceVisible ? [{
      _id: PAGE_ID, userId: USER_ID, title: 'Source Wiki', status: 'draft',
      hiddenFromHome: false, debugOnly: false, archived: false
    }] : []).filter(row => matches(row, query)))
  };
  const ConceptDecisionLessonEvidence = {
    db,
    findOne: query => new Query(state.adoptions.find(row => matches(row, query)) || null),
    find: query => new Query(state.adoptions.filter(row => matches(row, query))),
    create: async rows => {
      const row = JSON.parse(JSON.stringify(rows[0]));
      if (state.adoptions.some(existing => (
        existing.userId === row.userId
        && existing.targetConceptId === row.targetConceptId
        && existing.sourcePageId === row.sourcePageId
        && existing.decisionId === row.decisionId
      ))) {
        const error = new Error('duplicate'); error.code = 11000; throw error;
      }
      state.adoptions.push(row);
      return [row];
    }
  };
  const NoeisReceipt = {
    findOne: query => new Query(state.receipts.find(row => matches(row, query)) || null),
    find: query => new Query(state.receipts.filter(row => matches(row, query))),
    findOneAndUpdate: async (query, update) => {
      if (failReceipt) return null;
      let row = state.receipts.find(value => matches(value, query));
      if (!row) { row = {}; state.receipts.push(row); }
      Object.assign(row, JSON.parse(JSON.stringify(update.$set)));
      return row;
    }
  };
  return { state, models: { TagMeta, WikiPage, ConceptDecisionLessonEvidence, NoeisReceipt } };
};

const request = (models, overrides = {}) => adoptDecisionLessonEvidence({
  userId: USER_ID,
  targetConceptId: CONCEPT_ID,
  sourcePageId: PAGE_ID,
  decisionId: DECISION_ID,
  lessonId: LESSON_ID,
  role: 'support',
  requestId: 'request-1',
  expectedDecisionHash: DECISION_HASH,
  expectedOutcomeHash: OUTCOME_HASH,
  models,
  buildLessons: async ({ session }) => {
    assert.ok(session);
    return [canonicalLesson()];
  },
  now: () => new Date('2026-08-01T12:00:00.000Z'),
  ...overrides
});
const load = (harness, overrides = {}) => loadConceptDecisionLessonEvidence({
  userId: USER_ID,
  targetConceptId: CONCEPT_ID,
  ConceptDecisionLessonEvidence: harness.models.ConceptDecisionLessonEvidence,
  NoeisReceipt: harness.models.NoeisReceipt,
  WikiPage: harness.models.WikiPage,
  models: harness.models,
  buildLessons: async () => [canonicalLesson()],
  asOf: new Date('2026-08-01T12:00:00.000Z'),
  ...overrides
});

(async () => {
  const harness = buildHarness();
  const created = await request(harness.models);
  assert.strictEqual(created.idempotent, false);
  assert.strictEqual(created.adoption.role, 'support');
  assert.strictEqual(created.adoption.acceptedIntoConcept, true);
  assert.strictEqual(created.adoption.lesson, canonicalLesson().lesson);
  assert.strictEqual(created.adoption.provenance.decisionSnapshotHash, DECISION_HASH);
  assert.strictEqual(harness.state.adoptions.length, 1);
  assert.strictEqual(harness.state.receipts.length, 1);
  assert.strictEqual(created.adoption.id, stableAdoptionId({
    targetConceptId: CONCEPT_ID, sourcePageId: PAGE_ID, decisionId: DECISION_ID
  }));
  assert.strictEqual(created.receipt.id, stableReceiptId({
    targetConceptId: CONCEPT_ID, sourcePageId: PAGE_ID, decisionId: DECISION_ID
  }));

  const replay = await request(harness.models);
  assert.strictEqual(replay.idempotent, true);
  assert.strictEqual(harness.state.adoptions.length, 1);
  assert.strictEqual(harness.state.receipts.length, 1);

  await assert.rejects(
    () => request(harness.models, { role: 'tension' }),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'role_conflict'
  );
  await assert.rejects(
    () => request(harness.models, { requestId: 'different-request' }),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'adoption_conflict'
  );
  await assert.rejects(
    () => request(buildHarness().models, { expectedOutcomeHash: 'c'.repeat(64) }),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'stale_lesson'
  );
  await assert.rejects(
    () => request(buildHarness().models, { role: '' }),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.status === 400
  );
  await assert.rejects(
    () => request(buildHarness().models, { buildLessons: async () => [] }),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'lesson_unavailable'
  );
  await assert.rejects(
    () => request(buildHarness().models, {
      buildLessons: async () => [{
        ...canonicalLesson(),
        page: { ...canonicalLesson().page, id: '64f600000000000000000099' }
      }]
    }),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'lesson_unavailable'
  );
  await assert.rejects(
    () => request(buildHarness().models, {
      buildLessons: async () => [{ ...canonicalLesson(), relevanceBasis: null }]
    }),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'lesson_unavailable'
  );
  await assert.rejects(
    () => request(buildHarness().models, {
      buildLessons: async () => [{
        ...canonicalLesson(),
        relevanceBasis: { type: 'explicit_wiki_investigation', pageId: '64f600000000000000000099' }
      }]
    }),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'lesson_unavailable'
  );

  const orphanAdoption = buildHarness();
  await request(orphanAdoption.models);
  orphanAdoption.state.receipts = [];
  await assert.rejects(
    () => request(orphanAdoption.models),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'adoption_conflict'
  );

  const orphanReceipt = buildHarness();
  await request(orphanReceipt.models);
  orphanReceipt.state.adoptions = [];
  await assert.rejects(
    () => request(orphanReceipt.models),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'adoption_conflict'
  );

  const receiptTamperCases = [
    ['requestId', 'changed-request'],
    ['acceptedRevisionId', '64f600000000000000000099'],
    ['outcomeReceiptId', 'changed-outcome-receipt'],
    ['decisionSnapshotHash', 'd'.repeat(64)],
    ['observedEvidence', [{ type: 'article', id: 'changed-evidence', parentId: null }]]
  ];
  for (const [field, value] of receiptTamperCases) {
    const tamperedReceipt = buildHarness();
    await request(tamperedReceipt.models);
    tamperedReceipt.state.receipts[0].provenance[field] = value;
    await assert.rejects(
      () => request(tamperedReceipt.models),
      error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'adoption_conflict',
      `receipt provenance ${field} must be bound`
    );
  }

  for (const mutate of [
    receipt => { receipt.source = 'wiki'; },
    receipt => { receipt.status = 'failed'; },
    receipt => { receipt.provenance.version = 2; },
    receipt => { receipt.provenance.actorType = 'agent'; },
    receipt => { receipt.touched = receipt.touched.slice(0, 2); },
    receipt => { receipt.touched.push({ type: 'article', id: 'unexpected', title: '' }); }
  ]) {
    const tamperedEnvelope = buildHarness();
    await request(tamperedEnvelope.models);
    mutate(tamperedEnvelope.state.receipts[0]);
    await assert.rejects(
      () => request(tamperedEnvelope.models),
      error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'adoption_conflict',
      'receipt envelope and touch set must be bound'
    );
  }

  const rollback = buildHarness({ failReceipt: true });
  await assert.rejects(
    () => request(rollback.models),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'receipt_failed'
  );
  assert.deepStrictEqual(rollback.state.adoptions, []);
  assert.deepStrictEqual(rollback.state.receipts, []);

  await assert.rejects(
    () => request(buildHarness({ transactions: false }).models),
    error => error instanceof ConceptDecisionLessonAdoptionError && error.code === 'transactions_required'
  );

  const loaded = await load(harness);
  assert.strictEqual(loaded.items.length, 1);
  assert.strictEqual(loaded.items[0].id, created.adoption.id);
  assert.deepStrictEqual(loaded.integrity, {
    scanned: 1, accepted: 1, omitted: 0, sourceUnavailable: 0, continuityUnavailable: 0
  });

  const readTamper = buildHarness();
  await request(readTamper.models);
  readTamper.state.adoptions[0].lessonSnapshot = 'Tampered lesson.';
  const suppressedTamper = await load(readTamper);
  assert.deepStrictEqual(suppressedTamper.items, []);
  assert.strictEqual(suppressedTamper.integrity.omitted, 1);

  const invalidDateRead = buildHarness();
  await request(invalidDateRead.models);
  invalidDateRead.state.adoptions[0].observedAt = 'not-a-date';
  const suppressedInvalidDate = await load(invalidDateRead);
  assert.deepStrictEqual(suppressedInvalidDate.items, []);
  assert.strictEqual(suppressedInvalidDate.integrity.omitted, 1);

  const readOrphan = buildHarness();
  await request(readOrphan.models);
  readOrphan.state.receipts = [];
  const suppressedOrphan = await load(readOrphan);
  assert.deepStrictEqual(suppressedOrphan.items, []);
  assert.strictEqual(suppressedOrphan.integrity.omitted, 1);

  const foreignReceiptRead = buildHarness();
  await request(foreignReceiptRead.models);
  foreignReceiptRead.state.receipts[0].userId = '64f600000000000000000099';
  const suppressedForeignReceipt = await load(foreignReceiptRead);
  assert.deepStrictEqual(suppressedForeignReceipt.items, []);

  const wrongProvenanceRead = buildHarness();
  await request(wrongProvenanceRead.models);
  wrongProvenanceRead.state.receipts[0].provenance.decisionId = 'wrong-decision';
  const suppressedWrongProvenance = await load(wrongProvenanceRead);
  assert.deepStrictEqual(suppressedWrongProvenance.items, []);

  const unavailableSource = buildHarness({ sourceVisible: false });
  await request(unavailableSource.models);
  const suppressedUnavailableSource = await load(unavailableSource);
  assert.deepStrictEqual(suppressedUnavailableSource.items, []);
  assert.strictEqual(suppressedUnavailableSource.integrity.sourceUnavailable, 1);

  const corruptOriginalContinuity = buildHarness();
  await request(corruptOriginalContinuity.models);
  const suppressedContinuity = await load(corruptOriginalContinuity, {
    buildLessons: async () => []
  });
  assert.deepStrictEqual(suppressedContinuity.items, []);
  assert.strictEqual(suppressedContinuity.integrity.continuityUnavailable, 1);

  const futureAcceptance = buildHarness();
  await request(futureAcceptance.models);
  futureAcceptance.state.adoptions[0].acceptedAt = '2099-01-01T00:00:00.000Z';
  futureAcceptance.state.adoptions[0].payloadHash = payloadHash(futureAcceptance.state.adoptions[0]);
  futureAcceptance.state.receipts[0].completedAt = '2099-01-01T00:00:00.000Z';
  futureAcceptance.state.receipts[0].provenance.payloadHash = futureAcceptance.state.adoptions[0].payloadHash;
  const suppressedFuture = await load(futureAcceptance);
  assert.deepStrictEqual(suppressedFuture.items, []);
  assert.strictEqual(suppressedFuture.integrity.omitted, 1);

  const schemaRecord = new EvidenceModel({
    ...harness.state.adoptions[0],
    _id: undefined
  });
  assert.strictEqual(schemaRecord.validateSync(), undefined);

  console.log('conceptDecisionLessonAdoptionService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
