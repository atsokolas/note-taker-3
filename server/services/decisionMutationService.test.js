const assert = require('assert');
const mongoose = require('mongoose');
const {
  DecisionMutationError,
  assertNoGenericDecisionMutation,
  createAcceptedDecision,
  immutableDecisionHash,
  recordDecisionOutcome,
  transitionDecision
} = require('./decisionMutationService');
const { snapshotContentHash } = require('./wikiRevisionService');
const {
  validateBoundedClaimCandidate,
  __testables: claimDispositionTestables
} = require('./wikiClaimDispositionService');

const USER_ID = '64f500000000000000000001';
const PAGE_ID = '64f500000000000000000010';
const REVISION_ID = '64f500000000000000000020';
const SOURCE_REF_ID = '64f500000000000000000030';
const DISPOSITION_RECEIPT_ID = `wiki-claim-disposition:v1:${REVISION_ID}:accept`;
const clone = value => JSON.parse(JSON.stringify(value));

class Query {
  constructor(value) { this.value = value; }
  session() { return this; }
  select() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const receipts = new Map();
const revisionRows = [];
const page = {
  _id: PAGE_ID,
  userId: USER_ID,
  title: 'Decision continuity fixture',
  status: 'draft',
  claims: [{ claimId: 'claim-1', text: 'Exact claim.' }],
  sourceRefs: [{ _id: SOURCE_REF_ID, type: 'wiki_page', objectId: PAGE_ID, title: 'Owned Wiki evidence' }],
  judgment: { decisions: [] },
  markModified() {},
  async save() { return this; },
  toObject() { return JSON.parse(JSON.stringify(this, (key, value) => typeof value === 'function' ? undefined : value)); }
};
const basis = {
  _id: REVISION_ID,
  userId: USER_ID,
  pageId: PAGE_ID,
  promotionStatus: 'promoted',
  actorType: 'agent',
  reason: 'source_event',
  sourceEventId: null,
  maintenanceRunId: null,
  before: {
    title: page.title,
    claims: [{ ...clone(page.claims[0]), text: 'Earlier exact claim.' }],
    sourceRefs: page.sourceRefs,
    judgment: { decisions: [] }
  },
  after: {
    title: page.title,
    claims: page.claims,
    sourceRefs: page.sourceRefs,
    judgment: { decisions: [] }
  },
  claimReview: {
    version: 1,
    scope: 'claim',
    targetClaimId: 'claim-1',
    state: 'accepted',
    events: []
  }
};
const basisIdentity = validateBoundedClaimCandidate({ revision: basis, page: basis.before });
const basisAcceptedAt = '2026-07-31T12:00:00.000Z';
basis.claimReview = {
  ...basis.claimReview,
  proposedClaim: clone(basisIdentity.proposedClaim),
  baseClaimHash: basisIdentity.baseClaimHash,
  proposedClaimHash: basisIdentity.proposedClaimHash,
  basePageHash: snapshotContentHash(basis.before),
  conceptId: null,
  bodyPatch: null,
  deferredUntil: null,
  reviewedAt: basisAcceptedAt,
  events: [{ action: 'accept', at: basisAcceptedAt, note: '', deferredUntil: null, receiptId: DISPOSITION_RECEIPT_ID }]
};
const dispositionReceipt = {
  userId: USER_ID,
  receiptId: DISPOSITION_RECEIPT_ID,
  kind: 'wiki_claim_disposition',
  source: 'wiki',
  status: 'completed',
  title: 'Accept claim revision',
  summary: 'Human owner chose to accept the proposed claim revision.',
  touched: [{ type: 'wiki_page', id: PAGE_ID }, { type: 'wiki_revision', id: REVISION_ID }],
  provenance: {
    version: 1,
    action: 'accept',
    revisionId: REVISION_ID,
    pageId: PAGE_ID,
    sourceEventId: '',
    maintenanceRunId: '',
    retainedCandidateHash: claimDispositionTestables.retainedCandidateHash(basis),
    claimId: 'claim-1',
    basePageHash: basis.claimReview.basePageHash,
    conceptId: null,
    noteHash: claimDispositionTestables.digest(''),
    baseClaimHash: basisIdentity.baseClaimHash,
    proposedClaimHash: basisIdentity.proposedClaimHash,
    bodyPatch: null,
    deferredUntil: null
  },
  completedAt: basisAcceptedAt
};
basis.claimReview.receipt = { ...clone(dispositionReceipt), id: DISPOSITION_RECEIPT_ID };
delete basis.claimReview.receipt.receiptId;
delete basis.claimReview.receipt.userId;
receipts.set(DISPOSITION_RECEIPT_ID, dispositionReceipt);
revisionRows.push(basis);

function WikiRevision(data) { Object.assign(this, data); }
WikiRevision.db = { base: mongoose };
WikiRevision.findOne = query => new Query(revisionRows.find(row => (
  String(row._id) === String(query._id)
  && String(row.pageId) === String(query.pageId || row.pageId)
  && String(row.userId) === String(query.userId)
)) || null);
WikiRevision.prototype.save = async function save() { revisionRows.push(this); return this; };

const session = {
  async withTransaction(callback) { await callback(); },
  async endSession() {}
};
const WikiPage = {
  db: { startSession: async () => session },
  findOne: query => new Query(
    String(query._id) === PAGE_ID && String(query.userId) === USER_ID ? page : null
  )
};
const NoeisReceipt = {
  findOne: query => new Query(receipts.get(query.receiptId) || null),
  findOneAndUpdate: async (query, update) => {
    const stored = { ...update.$set, receiptId: query.receiptId };
    receipts.set(query.receiptId, stored);
    return stored;
  }
};
const models = {
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  Article: { findOne: () => new Query(null) },
  NotebookEntry: { findOne: () => new Query(null) },
  Question: { findOne: () => new Query(null) },
  TagMeta: { findOne: () => new Query(null) }
};

(async () => {
  const withTamperedReceipt = async ({ receiptId, mutate, replay, expectedCode }) => {
    const original = clone(receipts.get(receiptId));
    const tampered = clone(original);
    mutate(tampered);
    receipts.set(receiptId, tampered);
    try {
      await assert.rejects(
        replay,
        error => error instanceof DecisionMutationError && error.code === expectedCode
      );
    } finally {
      receipts.set(receiptId, original);
    }
  };
  const withMissingReceipt = async ({ receiptId, replay, expectedCode }) => {
    const original = receipts.get(receiptId);
    receipts.delete(receiptId);
    try {
      await assert.rejects(
        replay,
        error => error instanceof DecisionMutationError && error.code === expectedCode
      );
    } finally {
      receipts.set(receiptId, original);
    }
  };
  const withTamperedRevision = async ({ revisionId, mutate, replay, expectedCode }) => {
    const index = revisionRows.findIndex(row => String(row._id) === String(revisionId));
    const original = revisionRows[index];
    const tampered = clone(original);
    mutate(tampered);
    revisionRows[index] = tampered;
    try {
      await assert.rejects(
        replay,
        error => error instanceof DecisionMutationError && error.code === expectedCode
      );
    } finally {
      revisionRows[index] = original;
    }
  };

  await assert.rejects(
    () => createAcceptedDecision({
      userId: USER_ID, pageId: PAGE_ID, acceptedRevisionId: REVISION_ID, requestId: 'ungrounded',
      decision: { summary: 'Words without grounding.' },
      now: () => new Date('2026-08-01T12:00:00.000Z'), ...models
    }),
    error => error instanceof DecisionMutationError && /rationale/.test(error.message)
  );
  await assert.rejects(
    () => createAcceptedDecision({
      userId: USER_ID, pageId: PAGE_ID, acceptedRevisionId: REVISION_ID, requestId: 'caller-id',
      decision: { decisionId: 'caller-controlled' }, ...models
    }),
    error => error instanceof DecisionMutationError && error.code === 'server_generated_identity'
  );
  const created = await createAcceptedDecision({
    userId: USER_ID,
    pageId: PAGE_ID,
    acceptedRevisionId: REVISION_ID,
    requestId: 'test-create-1',
    decision: {
      decisionType: 'research',
      summary: 'Run the exact bounded test.',
      rationale: 'The accepted claim supports a measurable test.',
      expectedOutcome: 'One measured result.',
      successCriteria: ['Result is observable'],
      status: 'taken',
      relatedClaimIds: ['claim-1'],
      sourceRefIds: [SOURCE_REF_ID],
      reviewAt: '2026-08-10T12:00:00.000Z',
      outcomeDueAt: '2026-08-15T12:00:00.000Z'
    },
    now: () => new Date('2026-08-01T12:00:00.000Z'),
    ...models
  });
  assert.strictEqual(created.idempotent, false);
  assert.strictEqual(created.decision.status, 'taken');
  assert.strictEqual(String(created.decision.acceptedRevisionId), REVISION_ID);
  assert.strictEqual(created.decision.acceptedRevisionDisposition, 'accepted');
  assert.ok(created.decision.recordedRevisionId);
  assert.strictEqual(immutableDecisionHash(created.decision), created.decision.immutableSnapshotHash);
  assert.ok(receipts.has(created.decision.receiptId));

  await assert.rejects(
    () => createAcceptedDecision({
      userId: USER_ID,
      pageId: PAGE_ID,
      acceptedRevisionId: REVISION_ID,
      requestId: 'past-outcome-clock',
      decision: {
        decisionType: 'research',
        summary: 'Reject a stale outcome clock.',
        rationale: 'A return movement must be anchored to a future human-set clock.',
        expectedOutcome: 'No decision is created.',
        status: 'taken',
        relatedClaimIds: ['claim-1'],
        sourceRefIds: [SOURCE_REF_ID],
        reviewAt: '2026-08-10T12:00:00.000Z',
        outcomeDueAt: '2026-07-31T12:00:00.000Z'
      },
      now: () => new Date('2026-08-01T12:00:00.000Z'),
      ...models
    }),
    error => error instanceof DecisionMutationError && /outcomeDueAt must be in the future/.test(error.message)
  );

  const replay = await createAcceptedDecision({
    userId: USER_ID,
    pageId: PAGE_ID,
    acceptedRevisionId: REVISION_ID,
    requestId: 'test-create-1',
    decision: {
      decisionType: 'research',
      summary: 'Run the exact bounded test.',
      rationale: 'The accepted claim supports a measurable test.',
      expectedOutcome: 'One measured result.',
      successCriteria: ['Result is observable'],
      status: 'taken',
      relatedClaimIds: ['claim-1'],
      sourceRefIds: [SOURCE_REF_ID],
      reviewAt: '2026-08-10T12:00:00.000Z',
      outcomeDueAt: '2026-08-15T12:00:00.000Z'
    },
    now: () => new Date('2026-08-01T12:00:00.000Z'),
    ...models
  });
  assert.strictEqual(replay.idempotent, true);
  assert.strictEqual(page.judgment.decisions.length, 1);

  const createReplayArgs = {
    userId: USER_ID,
    pageId: PAGE_ID,
    acceptedRevisionId: REVISION_ID,
    requestId: 'test-create-1',
    decision: {
      decisionType: 'research',
      summary: 'Run the exact bounded test.',
      rationale: 'The accepted claim supports a measurable test.',
      expectedOutcome: 'One measured result.',
      successCriteria: ['Result is observable'],
      status: 'taken',
      relatedClaimIds: ['claim-1'],
      sourceRefIds: [SOURCE_REF_ID],
      reviewAt: '2026-08-10T12:00:00.000Z',
      outcomeDueAt: '2026-08-15T12:00:00.000Z'
    },
    now: () => new Date('2026-08-01T12:00:00.000Z'),
    ...models
  };
  for (const mutate of [
    receipt => { receipt.kind = 'wrong_kind'; },
    receipt => { delete receipt.completedAt; },
    receipt => { receipt.completedAt = '2026-08-11T12:00:00.000Z'; },
    receipt => { receipt.provenance.requestId = 'wrong-request'; },
    receipt => { receipt.provenance.acceptedStatus = 'planned'; },
    receipt => { receipt.provenance.recordedRevisionId = REVISION_ID; },
    receipt => { receipt.provenance.immutableSnapshotHash = 'tampered'; },
    receipt => { receipt.provenance.sourceRefIds.push(SOURCE_REF_ID); },
    receipt => { receipt.touched = receipt.touched.filter(item => item.id !== String(created.decision.recordedRevisionId)); }
  ]) {
    await withTamperedReceipt({
      receiptId: created.decision.receiptId,
      mutate,
      replay: () => createAcceptedDecision(createReplayArgs),
      expectedCode: 'decision_receipt_integrity_failed'
    });
  }
  await withMissingReceipt({
    receiptId: created.decision.receiptId,
    replay: () => createAcceptedDecision(createReplayArgs),
    expectedCode: 'decision_receipt_integrity_failed'
  });
  await withTamperedRevision({
    revisionId: created.decision.recordedRevisionId,
    mutate: revision => {
      const recorded = revision.after.judgment.decisions.find(item => item.decisionId === created.decision.decisionId);
      recorded.receiptId = 'forged';
      recorded.recordedRevisionId = REVISION_ID;
      recorded.acceptedAt = '1999-01-01T00:00:00.000Z';
      recorded.decidedAt = '1999-01-01T00:00:00.000Z';
    },
    replay: () => createAcceptedDecision(createReplayArgs),
    expectedCode: 'decision_receipt_integrity_failed'
  });
  await withTamperedRevision({
    revisionId: created.decision.recordedRevisionId,
    mutate: revision => {
      revision.after.judgment.decisions
        .find(item => item.decisionId === created.decision.decisionId).decidedAt = '1999-01-01T00:00:00.000Z';
    },
    replay: () => createAcceptedDecision(createReplayArgs),
    expectedCode: 'decision_receipt_integrity_failed'
  });

  await assert.rejects(
    () => createAcceptedDecision({
      userId: USER_ID, pageId: PAGE_ID, acceptedRevisionId: REVISION_ID, requestId: 'test-create-1',
      decision: {
        summary: 'Conflicting rationale.',
        rationale: 'Different rationale.',
        expectedOutcome: 'Different result.',
        status: 'taken',
        relatedClaimIds: ['claim-1'],
        sourceRefIds: [SOURCE_REF_ID],
        reviewAt: '2026-08-10T12:00:00.000Z'
      },
      now: () => new Date('2026-08-01T12:00:00.000Z'), ...models
    }),
    error => error instanceof DecisionMutationError && error.code === 'decision_conflict'
  );

  const planned = await createAcceptedDecision({
    userId: USER_ID,
    pageId: PAGE_ID,
    acceptedRevisionId: REVISION_ID,
    requestId: 'test-transition-take-1',
    decision: {
      decisionType: 'operating',
      summary: 'Take the planned bounded action.',
      rationale: 'The accepted claim supports a reversible operating test.',
      expectedOutcome: 'The action produces one observable result.',
      status: 'planned',
      relatedClaimIds: ['claim-1'],
      sourceRefIds: [SOURCE_REF_ID],
      reviewAt: '2026-08-12T12:00:00.000Z'
    },
    now: () => new Date('2026-08-01T13:00:00.000Z'),
    ...models
  });
  const beforeTransitionRevisionCount = revisionRows.length;
  const beforeTransitionReceiptCount = receipts.size;
  const taken = await transitionDecision({
    userId: USER_ID,
    pageId: PAGE_ID,
    decisionId: planned.decision.decisionId,
    action: 'take',
    now: () => new Date('2026-08-02T13:00:00.000Z'),
    ...models
  });
  assert.strictEqual(taken.idempotent, false);
  assert.strictEqual(taken.decision.status, 'taken');
  assert.strictEqual(new Date(taken.decision.decidedAt).toISOString(), '2026-08-02T13:00:00.000Z');
  assert.strictEqual(revisionRows.length, beforeTransitionRevisionCount + 1);
  assert.strictEqual(receipts.size, beforeTransitionReceiptCount + 1);
  const transitionReceiptId = `wiki-decision:v1:${PAGE_ID}:${planned.decision.decisionId}:take`;
  const transitionRevisionId = receipts.get(transitionReceiptId).provenance.revisionId;
  const transitionRevision = revisionRows.find(row => String(row._id) === String(transitionRevisionId));
  assert.strictEqual(transitionRevision.before.judgment.decisions.find(item => item.decisionId === planned.decision.decisionId).status, 'planned');
  assert.strictEqual(transitionRevision.after.judgment.decisions.find(item => item.decisionId === planned.decision.decisionId).status, 'taken');

  const transitionReplayArgs = {
    userId: USER_ID,
    pageId: PAGE_ID,
    decisionId: planned.decision.decisionId,
    action: 'take',
    now: () => new Date('2026-08-03T13:00:00.000Z'),
    ...models
  };
  const transitionReplay = await transitionDecision(transitionReplayArgs);
  assert.strictEqual(transitionReplay.idempotent, true);
  assert.strictEqual(revisionRows.length, beforeTransitionRevisionCount + 1);
  assert.strictEqual(receipts.size, beforeTransitionReceiptCount + 1);
  const plannedAcceptanceReplayArgs = {
    userId: USER_ID,
    pageId: PAGE_ID,
    acceptedRevisionId: REVISION_ID,
    requestId: 'test-transition-take-1',
    decision: {
      decisionType: 'operating',
      summary: 'Take the planned bounded action.',
      rationale: 'The accepted claim supports a reversible operating test.',
      expectedOutcome: 'The action produces one observable result.',
      status: 'planned',
      relatedClaimIds: ['claim-1'],
      sourceRefIds: [SOURCE_REF_ID],
      reviewAt: '2026-08-12T12:00:00.000Z'
    },
    now: () => new Date('2026-08-01T13:00:00.000Z'),
    ...models
  };
  assert.strictEqual((await createAcceptedDecision(plannedAcceptanceReplayArgs)).idempotent, true);
  await withTamperedRevision({
    revisionId: planned.decision.recordedRevisionId,
    mutate: revision => {
      revision.after.judgment.decisions
        .find(item => item.decisionId === planned.decision.decisionId).decidedAt = '1999-01-01T00:00:00.000Z';
    },
    replay: () => createAcceptedDecision(plannedAcceptanceReplayArgs),
    expectedCode: 'decision_receipt_integrity_failed'
  });
  for (const mutate of [
    receipt => { receipt.kind = 'wrong_kind'; },
    receipt => { delete receipt.completedAt; },
    receipt => { receipt.provenance.revisionId = REVISION_ID; },
    receipt => { receipt.provenance.immutableSnapshotHash = 'tampered'; },
    receipt => { receipt.completedAt = '1999-01-01T00:00:00.000Z'; },
    receipt => { receipt.touched = receipt.touched.filter(item => item.type !== 'wiki_revision'); }
  ]) {
    await withTamperedReceipt({
      receiptId: transitionReceiptId,
      mutate,
      replay: () => transitionDecision(transitionReplayArgs),
      expectedCode: 'transition_receipt_integrity_failed'
    });
  }
  await withMissingReceipt({
    receiptId: transitionReceiptId,
    replay: () => transitionDecision(transitionReplayArgs),
    expectedCode: 'transition_receipt_integrity_failed'
  });
  await withTamperedRevision({
    revisionId: transitionRevisionId,
    mutate: revision => {
      revision.after.judgment.decisions.find(item => item.decisionId === planned.decision.decisionId).decidedAt = '1999-01-01T00:00:00.000Z';
    },
    replay: () => transitionDecision(transitionReplayArgs),
    expectedCode: 'transition_receipt_integrity_failed'
  });

  await assert.rejects(
    () => recordDecisionOutcome({
      userId: USER_ID,
      pageId: PAGE_ID,
      decisionId: created.decision.decisionId,
      outcome: {
        expectedDecisionHash: created.decision.immutableSnapshotHash,
        observedAt: '2000-01-01T00:00:00.000Z',
        summary: 'Impossible pre-decision observation.',
        result: 'mixed',
        calibrationNote: 'This clock order must fail closed.',
        lesson: 'Do not retain impossible outcome chronology.',
        evidenceSourceRefIds: [SOURCE_REF_ID]
      },
      now: () => new Date('2026-08-03T12:00:00.000Z'),
      ...models
    }),
    error => error instanceof DecisionMutationError && error.code === 'observation_precedes_decision'
  );

  const outcome = await recordDecisionOutcome({
    userId: USER_ID,
    pageId: PAGE_ID,
    decisionId: created.decision.decisionId,
    outcome: {
      expectedDecisionHash: created.decision.immutableSnapshotHash,
      observedAt: '2026-08-02T12:00:00.000Z',
      summary: 'The bounded signal was observed.',
      result: 'positive',
      processScore: 0.8,
      calibrationNote: 'The expected direction was correct; magnitude remains uncertain.',
      lesson: 'Retain the narrower mechanism and test magnitude separately.',
      evidenceSourceRefIds: [SOURCE_REF_ID]
    },
    now: () => new Date('2026-08-03T12:00:00.000Z'),
    ...models
  });
  assert.strictEqual(outcome.decision.status, 'reviewed');
  assert.ok(outcome.decision.outcome.revisionId);
  assert.ok(outcome.decision.outcome.receiptId);
  assert.ok(outcome.decision.outcome.recordHash);
  assert.strictEqual(outcome.decision.rationale, 'The accepted claim supports a measurable test.');

  const outcomeReplay = await recordDecisionOutcome({
    userId: USER_ID,
    pageId: PAGE_ID,
    decisionId: created.decision.decisionId,
    outcome: {
      expectedDecisionHash: created.decision.immutableSnapshotHash,
      observedAt: '2026-08-02T12:00:00.000Z',
      summary: 'The bounded signal was observed.',
      result: 'positive',
      processScore: 0.8,
      calibrationNote: 'The expected direction was correct; magnitude remains uncertain.',
      lesson: 'Retain the narrower mechanism and test magnitude separately.',
      evidenceSourceRefIds: [SOURCE_REF_ID]
    },
    now: () => new Date('2026-08-03T12:00:00.000Z'),
    ...models
  });
  assert.strictEqual(outcomeReplay.idempotent, true);

  const outcomeReplayArgs = {
    userId: USER_ID,
    pageId: PAGE_ID,
    decisionId: created.decision.decisionId,
    outcome: {
      expectedDecisionHash: created.decision.immutableSnapshotHash,
      observedAt: '2026-08-02T12:00:00.000Z',
      summary: 'The bounded signal was observed.',
      result: 'positive',
      processScore: 0.8,
      calibrationNote: 'The expected direction was correct; magnitude remains uncertain.',
      lesson: 'Retain the narrower mechanism and test magnitude separately.',
      evidenceSourceRefIds: [SOURCE_REF_ID]
    },
    now: () => new Date('2026-08-03T12:00:00.000Z'),
    ...models
  };
  for (const mutate of [
    receipt => { receipt.kind = 'wrong_kind'; },
    receipt => { delete receipt.completedAt; },
    receipt => { receipt.provenance.payloadHash = 'tampered'; },
    receipt => { receipt.provenance.revisionId = REVISION_ID; },
    receipt => { receipt.provenance.acceptedRevisionId = 'wrong-basis'; },
    receipt => { receipt.provenance.decisionSnapshotHash = 'tampered'; },
    receipt => { receipt.provenance.evidenceSourceRefIds.push(SOURCE_REF_ID); },
    receipt => { receipt.completedAt = '1999-01-01T00:00:00.000Z'; },
    receipt => { receipt.touched = receipt.touched.filter(item => item.type !== 'wiki_revision'); }
  ]) {
    await withTamperedReceipt({
      receiptId: created.decision.outcome.receiptId,
      mutate,
      replay: () => recordDecisionOutcome(outcomeReplayArgs),
      expectedCode: 'outcome_receipt_integrity_failed'
    });
  }
  await withMissingReceipt({
    receiptId: created.decision.outcome.receiptId,
    replay: () => recordDecisionOutcome(outcomeReplayArgs),
    expectedCode: 'outcome_receipt_integrity_failed'
  });
  await withTamperedRevision({
    revisionId: created.decision.outcome.revisionId,
    mutate: revision => {
      const retainedOutcome = revision.after.judgment.decisions
        .find(item => item.decisionId === created.decision.decisionId).outcome;
      retainedOutcome.reviewedAt = '1999-01-01T00:00:00.000Z';
      retainedOutcome.reviewedBy = 'agent';
      retainedOutcome.revisionId = REVISION_ID;
      retainedOutcome.receiptId = 'forged';
      retainedOutcome.decisionSnapshotHash = 'forged';
    },
    replay: () => recordDecisionOutcome(outcomeReplayArgs),
    expectedCode: 'outcome_receipt_integrity_failed'
  });

  await assert.rejects(
    () => transitionDecision({
      userId: USER_ID, pageId: PAGE_ID, decisionId: created.decision.decisionId, action: 'cancel', ...models
    }),
    error => error instanceof DecisionMutationError && error.code === 'invalid_transition'
  );

  assert.doesNotThrow(() => assertNoGenericDecisionMutation({ previous: page.judgment.decisions, next: page.judgment.decisions }));
  assert.throws(
    () => assertNoGenericDecisionMutation({
      previous: page.judgment.decisions,
      next: [{ ...page.judgment.decisions[0], rationale: 'Silently rewritten.' }]
    }),
    error => error instanceof DecisionMutationError && error.code === 'transactional_decision_required'
  );
  assert.throws(
    () => assertNoGenericDecisionMutation({
      previous: page.judgment.decisions,
      next: [{ ...page.judgment.decisions[0], createdAt: '1999-01-01T00:00:00.000Z' }]
    }),
    error => error instanceof DecisionMutationError && error.code === 'transactional_decision_required'
  );

  const protectedProvenanceMutations = [
    ['acceptedAt', decision => ({ ...decision, acceptedAt: '1999-01-01T00:00:00.000Z' })],
    ['acceptedBy', decision => ({ ...decision, acceptedBy: '' })],
    ['recordedRevisionId', decision => ({ ...decision, recordedRevisionId: REVISION_ID })],
    ['receiptId', decision => ({ ...decision, receiptId: 'tampered-decision-receipt' })],
    ['immutableSnapshotHash', decision => ({ ...decision, immutableSnapshotHash: 'tampered-decision-hash' })],
    ['outcome.reviewedAt', decision => ({
      ...decision,
      outcome: { ...decision.outcome, reviewedAt: '1999-01-01T00:00:00.000Z' }
    })],
    ['outcome.reviewedBy', decision => ({ ...decision, outcome: { ...decision.outcome, reviewedBy: '' } })],
    ['outcome.revisionId', decision => ({
      ...decision,
      outcome: { ...decision.outcome, revisionId: REVISION_ID }
    })],
    ['outcome.receiptId', decision => ({
      ...decision,
      outcome: { ...decision.outcome, receiptId: 'tampered-outcome-receipt' }
    })],
    ['outcome.decisionSnapshotHash', decision => ({
      ...decision,
      outcome: { ...decision.outcome, decisionSnapshotHash: 'tampered-decision-hash' }
    })],
    ['outcome.recordHash', decision => ({
      ...decision,
      outcome: { ...decision.outcome, recordHash: 'tampered-outcome-hash' }
    })]
  ];
  protectedProvenanceMutations.forEach(([field, mutate]) => {
    assert.throws(
      () => assertNoGenericDecisionMutation({
        previous: page.judgment.decisions,
        next: [mutate(page.judgment.decisions[0])]
      }),
      error => error instanceof DecisionMutationError
        && error.code === 'transactional_decision_required',
      `${field} must be protected from generic Wiki edits.`
    );
  });

  await assert.rejects(
    () => recordDecisionOutcome({
      userId: USER_ID, pageId: PAGE_ID, decisionId: created.decision.decisionId,
      outcome: { expectedDecisionHash: 'stale', observedAt: '2026-08-02', summary: 'x', result: 'mixed', calibrationNote: 'x', lesson: 'x', evidenceSourceRefIds: [SOURCE_REF_ID] },
      now: () => new Date('2026-08-03T12:00:00.000Z'), ...models
    }),
    error => error instanceof DecisionMutationError && error.code === 'stale_decision'
  );

  console.log('decisionMutationService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
