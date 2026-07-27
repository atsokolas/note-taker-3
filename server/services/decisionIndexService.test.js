const assert = require('assert');
const {
  DecisionIndexError,
  buildDecisionIndex,
  decisionMatchesFilter,
  hasSubstantiveOutcome,
  __testables
} = require('./decisionIndexService');
const { snapshotContentHash } = require('./wikiRevisionService');
const {
  immutableDecisionHash,
  outcomeRecordHash,
  receiptIdForTransition
} = require('./decisionMutationService');
const {
  receiptIdFor: claimReceiptIdFor,
  validateBoundedClaimCandidate,
  __testables: claimDispositionTestables
} = require('./wikiClaimDispositionService');

const USER_ID = '64f500000000000000000001';
const PAGE_ID = '64f500000000000000000010';
const OTHER_PAGE_ID = '64f500000000000000000011';
const ARTICLE_ID = '64f500000000000000000020';
const SOURCE_REF_ID = '64f500000000000000000021';
const clone = value => JSON.parse(JSON.stringify(value));

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}
const modelFor = rows => ({ find: () => new Query(rows) });

const baseDecision = (decisionId, overrides = {}) => ({
  decisionId,
  decisionType: 'research',
  summary: `Decision ${decisionId}`,
  rationale: 'Bounded rationale.',
  expectedOutcome: 'An observable result.',
  successCriteria: ['One measurable signal'],
  status: 'planned',
  createdBy: 'user',
  createdAt: '2026-07-01T12:00:00.000Z',
  relatedClaimIds: [],
  sourceRefIds: [],
  outcome: { result: 'unknown', processScore: null },
  ...overrides
});

const page = {
  _id: PAGE_ID,
  userId: USER_ID,
  title: 'Inference economics',
  status: 'draft',
  plainText: 'A sufficiently substantive Wiki page for the decision index quality guard and its deterministic reconstruction.',
  sourceRefs: [{ _id: SOURCE_REF_ID, type: 'article', objectId: ARTICLE_ID, title: 'Owned evidence' }],
  claims: [{ claimId: 'claim-1', text: 'An exact current claim.' }],
  judgment: {
    governingQuestion: 'What should happen next?',
    currentJudgment: 'Run a bounded observation.',
    status: 'monitoring',
    decisionPosture: 'watch',
    decisions: [
      baseDecision('overdue', {
        reviewAt: '2026-07-31T12:00:00.000Z',
        relatedClaimIds: ['claim-1', 'missing-claim'],
        sourceRefIds: [SOURCE_REF_ID, '64f500000000000000000099']
      }),
      baseDecision('awaiting', {
        status: 'taken',
        decidedAt: '2026-07-30T12:00:00.000Z',
        reviewAt: '2026-08-15T12:00:00.000Z',
        outcomeDueAt: '2026-08-20T15:30:00.000Z'
      }),
      baseDecision('reviewed', {
        status: 'reviewed',
        decidedAt: '2026-07-10T12:00:00.000Z',
        outcome: {
          observedAt: '2026-07-29T12:00:00.000Z',
          summary: '<b>Observed result</b>',
          result: 'mixed',
          processScore: 0.7,
          lesson: 'Retain the measured lesson.'
        }
      }),
      baseDecision('partial-outcome', {
        status: 'taken',
        outcome: { summary: 'Recorded but not observed.', result: 'unknown', processScore: null }
      }),
      baseDecision('proposal', { createdBy: 'ai_proposed' }),
      baseDecision('cancelled', { status: 'cancelled' }),
      baseDecision('duplicate'),
      baseDecision('duplicate')
    ]
  }
};

const hiddenPage = { ...page, _id: OTHER_PAGE_ID, hiddenFromHome: true };
const foreignPage = { ...page, _id: '64f500000000000000000012', userId: '64f500000000000000000002' };
const models = {
  WikiPage: modelFor([page, hiddenPage, foreignPage]),
  Article: modelFor([
    { _id: ARTICLE_ID, userId: USER_ID, title: 'Owned evidence', highlights: [] },
    { _id: '64f500000000000000000022', userId: '64f500000000000000000002', title: 'Foreign evidence' }
  ]),
  NotebookEntry: modelFor([]),
  Question: modelFor([]),
  TagMeta: modelFor([])
};

(async () => {
  const asOf = new Date('2026-08-01T12:00:00.000Z');
  const first = await buildDecisionIndex({
    userId: USER_ID,
    filter: 'upcoming_review',
    windowDays: 30,
    limit: 1,
    asOf,
    models
  });
  assert.strictEqual(first.items.length, 1);
  assert.strictEqual(first.items[0].identity.decisionId, 'overdue');
  assert.strictEqual(first.items[0].dueState, 'overdue');
  assert.ok(first.nextCursor);
  assert.deepStrictEqual(first.counts, { all: 4, upcoming_review: 2, awaiting_outcome: 1, reviewed: 1 });
  assert.strictEqual(first.coverage.scannedPages, 1);
  assert.strictEqual(first.coverage.invalidDecisions, 2);
  assert.strictEqual(first.coverage.proposalsExcluded, 1);
  assert.deepStrictEqual(first.items[0].links.claims.resolved.map(ref => ref.id), ['claim-1']);
  assert.deepStrictEqual(first.items[0].links.claims.missingIds, ['missing-claim']);
  assert.deepStrictEqual(first.items[0].links.sources.resolved.map(ref => ref.id), [ARTICLE_ID]);
  assert.deepStrictEqual(first.items[0].links.sources.resolved.map(ref => ref.sourceRefId), [SOURCE_REF_ID]);
  assert.deepStrictEqual(first.items[0].links.sources.missingIds, ['64f500000000000000000099']);
  assert.strictEqual(first.items[0].continuity.acceptedRevisionId, null);
  assert.strictEqual(first.items[0].continuity.complete, false);
  assert.ok(first.items[0].continuity.missing.includes('accepted_revision_id'));

  const second = await buildDecisionIndex({
    userId: USER_ID,
    filter: 'upcoming_review',
    windowDays: 30,
    limit: 1,
    cursor: first.nextCursor,
    asOf: new Date('2099-01-01T00:00:00.000Z'),
    models
  });
  assert.deepStrictEqual(second.items.map(item => item.identity.decisionId), ['awaiting']);
  assert.strictEqual(second.asOf, asOf.toISOString());
  assert.strictEqual(second.nextCursor, null);
  await assert.rejects(
    () => buildDecisionIndex({ userId: USER_ID, filter: 'reviewed', cursor: first.nextCursor, asOf, models }),
    error => error instanceof DecisionIndexError && error.code === 'cursor_mismatch'
  );

  const awaiting = await buildDecisionIndex({ userId: USER_ID, filter: 'awaiting_outcome', asOf, models });
  assert.deepStrictEqual(awaiting.items.map(item => item.identity.decisionId), ['awaiting']);
  assert.strictEqual(awaiting.items[0].decision.outcomeDueAt, '2026-08-20T15:30:00.000Z');

  const reviewed = await buildDecisionIndex({ userId: USER_ID, filter: 'reviewed', asOf, models });
  assert.deepStrictEqual(reviewed.items.map(item => item.identity.decisionId), ['reviewed']);
  assert.strictEqual(reviewed.items[0].outcome.state, 'review_incomplete');
  assert.strictEqual(reviewed.items[0].outcome.observedAt, null);
  assert.strictEqual(reviewed.items[0].outcome.summary, 'Observed result');
  assert.strictEqual(reviewed.items[0].outcome.lesson, 'Retain the measured lesson.');

  const partial = page.judgment.decisions.find(decision => decision.decisionId === 'partial-outcome');
  assert.strictEqual(hasSubstantiveOutcome(partial), true);
  assert.strictEqual(decisionMatchesFilter({ decision: partial, filter: 'awaiting_outcome', asOf, windowDays: 30 }), false);
  assert.strictEqual(decisionMatchesFilter({ decision: partial, filter: 'reviewed', asOf, windowDays: 30 }), false);
  assert.strictEqual(decisionMatchesFilter({ decision: { ...partial, status: 'reviewed' }, filter: 'reviewed', asOf, windowDays: 30 }), true);
  const malformedScore = baseDecision('malformed-score', { status: 'taken', outcome: { processScore: 2 } });
  assert.strictEqual(hasSubstantiveOutcome(malformedScore), false);
  assert.strictEqual(decisionMatchesFilter({ decision: malformedScore, filter: 'awaiting_outcome', asOf, windowDays: 30 }), true);
  ['', true, false, [], '0.5'].forEach(processScore => {
    const malformed = baseDecision('malformed-score-type', { status: 'taken', outcome: { processScore } });
    assert.strictEqual(hasSubstantiveOutcome(malformed), false);
    assert.strictEqual(decisionMatchesFilter({ decision: malformed, filter: 'awaiting_outcome', asOf, windowDays: 30 }), true);
  });
  const futureObservation = baseDecision('future-observation', { status: 'taken', outcome: { observedAt: '2026-08-10T12:00:00.000Z' } });
  assert.strictEqual(hasSubstantiveOutcome(futureObservation, asOf), false);
  assert.strictEqual(decisionMatchesFilter({ decision: futureObservation, filter: 'awaiting_outcome', asOf, windowDays: 30 }), true);

  const changedUpdatedAt = { ...page, updatedAt: '2099-01-01T00:00:00.000Z' };
  const replay = await buildDecisionIndex({ userId: USER_ID, filter: 'upcoming_review', asOf, models: { ...models, WikiPage: modelFor([changedUpdatedAt]) } });
  assert.deepStrictEqual(replay.items.map(item => item.id), ['decision:' + PAGE_ID + ':overdue', 'decision:' + PAGE_ID + ':awaiting']);
  assert.deepStrictEqual(
    __testables.tupleFor({ page, decision: baseDecision('stable-cursor', { status: 'planned' }), filter: 'all', asOf }),
    __testables.tupleFor({ page, decision: baseDecision('stable-cursor', { status: 'reviewed' }), filter: 'all', asOf }),
    'all-filter cursor identity must not move when decision status changes'
  );

  const acceptedRevisionId = '64f500000000000000000070';
  const recordedRevisionId = '64f500000000000000000071';
  const outcomeRevisionId = '64f500000000000000000072';
  const transitionRevisionId = '64f500000000000000000073';
  const claimAcceptedAt = '2026-07-19T12:00:00.000Z';
  const decisionAcceptedAt = '2026-07-20T12:00:00.000Z';
  const decisionTakenAt = '2026-07-21T12:00:00.000Z';
  const outcomeReviewedAt = '2026-07-30T12:00:00.000Z';
  const acceptedBefore = {
    ...clone(page),
    claims: [{ ...clone(page.claims[0]), text: 'An earlier exact claim.' }],
    judgment: { ...clone(page.judgment), decisions: [] }
  };
  const acceptedBasis = {
    ...clone(acceptedBefore),
    claims: clone(page.claims)
  };
  const acceptedRevision = {
    _id: acceptedRevisionId,
    userId: USER_ID,
    pageId: PAGE_ID,
    sourceEventId: null,
    maintenanceRunId: null,
    reason: 'source_event',
    actorType: 'agent',
    promotionStatus: 'promoted',
    before: acceptedBefore,
    after: acceptedBasis,
    claimReview: {
      version: 1,
      scope: 'claim',
      targetClaimId: 'claim-1',
      state: 'accepted',
      events: []
    }
  };
  const claimIdentity = validateBoundedClaimCandidate({ revision: acceptedRevision, page: acceptedBefore });
  const dispositionReceiptId = claimReceiptIdFor(acceptedRevisionId, 'accept');
  acceptedRevision.claimReview = {
    ...acceptedRevision.claimReview,
    proposedClaim: clone(claimIdentity.proposedClaim),
    baseClaimHash: claimIdentity.baseClaimHash,
    proposedClaimHash: claimIdentity.proposedClaimHash,
    basePageHash: snapshotContentHash(acceptedBefore),
    conceptId: null,
    bodyPatch: null,
    deferredUntil: null,
    reviewedAt: claimAcceptedAt,
    events: [{ action: 'accept', at: claimAcceptedAt, note: '', deferredUntil: null, receiptId: dispositionReceiptId }]
  };
  const dispositionReceipt = {
    userId: USER_ID,
    receiptId: dispositionReceiptId,
    kind: 'wiki_claim_disposition',
    source: 'wiki',
    status: 'completed',
    title: 'Accept claim revision',
    summary: 'Human owner chose to accept the proposed claim revision.',
    touched: [
      { type: 'wiki_page', id: PAGE_ID },
      { type: 'wiki_revision', id: acceptedRevisionId }
    ],
    provenance: {
      version: 1,
      action: 'accept',
      revisionId: acceptedRevisionId,
      pageId: PAGE_ID,
      sourceEventId: '',
      maintenanceRunId: '',
      retainedCandidateHash: claimDispositionTestables.retainedCandidateHash(acceptedRevision),
      claimId: 'claim-1',
      basePageHash: acceptedRevision.claimReview.basePageHash,
      conceptId: null,
      noteHash: claimDispositionTestables.digest(''),
      baseClaimHash: claimIdentity.baseClaimHash,
      proposedClaimHash: claimIdentity.proposedClaimHash,
      bodyPatch: null,
      deferredUntil: null
    },
    completedAt: claimAcceptedAt
  };
  acceptedRevision.claimReview.receipt = {
    ...clone(dispositionReceipt),
    id: dispositionReceiptId
  };
  delete acceptedRevision.claimReview.receipt.receiptId;
  delete acceptedRevision.claimReview.receipt.userId;

  const recordedDecision = baseDecision('proven', {
    status: 'planned',
    createdAt: decisionAcceptedAt,
    decidedAt: null,
    reviewAt: '2026-08-15T12:00:00.000Z',
    outcomeDueAt: '2026-08-20T12:00:00.000Z',
    relatedClaimIds: ['claim-1'],
    sourceRefIds: [SOURCE_REF_ID],
    acceptedRevisionId,
    acceptedRevisionDisposition: 'accepted',
    recordedRevisionId,
    acceptedAt: decisionAcceptedAt,
    acceptedBy: 'user',
    basisPageHash: snapshotContentHash(acceptedBasis),
    receiptId: 'decision-receipt'
  });
  recordedDecision.immutableSnapshotHash = immutableDecisionHash(recordedDecision);
  const takenDecision = {
    ...clone(recordedDecision),
    status: 'taken',
    decidedAt: decisionTakenAt
  };
  const provenDecision = {
    ...clone(takenDecision),
    status: 'reviewed',
    outcome: {
      observedAt: '2026-07-29T12:00:00.000Z',
      summary: 'Observed.',
      result: 'positive',
      processScore: 0.8,
      calibrationNote: 'Calibrated.',
      lesson: 'Retain lesson.',
      evidenceSourceRefIds: [SOURCE_REF_ID],
      reviewedAt: outcomeReviewedAt,
      reviewedBy: 'user',
      revisionId: outcomeRevisionId,
      receiptId: 'outcome-receipt',
      recordHash: 'outcome-hash'
    }
  };
  provenDecision.outcome.decisionSnapshotHash = provenDecision.immutableSnapshotHash;
  provenDecision.outcome.recordHash = outcomeRecordHash(provenDecision.outcome);
  const recordedPage = { ...clone(page), claims: clone(acceptedBasis.claims), judgment: { ...clone(page.judgment), decisions: [recordedDecision] } };
  const takenPage = { ...clone(recordedPage), judgment: { ...clone(recordedPage.judgment), decisions: [takenDecision] } };
  const provenPage = { ...page, judgment: { ...page.judgment, decisions: [provenDecision] } };
  const revisions = [
    acceptedRevision,
    { _id: recordedRevisionId, userId: USER_ID, pageId: PAGE_ID, actorType: 'user', promotionStatus: 'promoted', before: acceptedBasis, after: recordedPage },
    { _id: transitionRevisionId, userId: USER_ID, pageId: PAGE_ID, actorType: 'user', promotionStatus: 'promoted', before: recordedPage, after: takenPage },
    { _id: outcomeRevisionId, userId: USER_ID, pageId: PAGE_ID, actorType: 'user', promotionStatus: 'promoted', before: takenPage, after: provenPage }
  ];
  const transitionReceiptId = receiptIdForTransition(PAGE_ID, 'proven', 'take');
  const receipts = [
    dispositionReceipt,
    {
      userId: USER_ID, receiptId: 'decision-receipt', kind: 'wiki_decision_accepted', source: 'wiki', status: 'completed', completedAt: decisionAcceptedAt,
      touched: [{ type: 'wiki_page', id: PAGE_ID }, { type: 'wiki_revision', id: acceptedRevisionId }, { type: 'wiki_revision', id: recordedRevisionId }],
      provenance: {
        version: 1, action: 'accept_decision', requestId: 'request-proven', pageId: PAGE_ID, decisionId: 'proven', acceptedRevisionId,
        recordedRevisionId, acceptedRevisionDisposition: 'accepted', acceptedStatus: 'planned', immutableSnapshotHash: provenDecision.immutableSnapshotHash,
        basisPageHash: provenDecision.basisPageHash, relatedClaimIds: provenDecision.relatedClaimIds,
        sourceRefIds: provenDecision.sourceRefIds, reviewAt: recordedDecision.reviewAt, outcomeDueAt: recordedDecision.outcomeDueAt
      }
    },
    {
      userId: USER_ID, receiptId: transitionReceiptId, kind: 'wiki_decision_taken', source: 'wiki', status: 'completed', completedAt: decisionTakenAt,
      touched: [{ type: 'wiki_page', id: PAGE_ID }, { type: 'wiki_revision', id: transitionRevisionId }],
      provenance: { version: 1, action: 'take', pageId: PAGE_ID, decisionId: 'proven', revisionId: transitionRevisionId, immutableSnapshotHash: provenDecision.immutableSnapshotHash }
    },
    {
      userId: USER_ID, receiptId: 'outcome-receipt', kind: 'wiki_decision_outcome_recorded', source: 'wiki', status: 'completed', completedAt: outcomeReviewedAt,
      touched: [{ type: 'wiki_page', id: PAGE_ID }, { type: 'wiki_revision', id: outcomeRevisionId }],
      provenance: {
        version: 1, action: 'record_outcome', pageId: PAGE_ID, decisionId: 'proven', revisionId: outcomeRevisionId,
        acceptedRevisionId, decisionSnapshotHash: provenDecision.immutableSnapshotHash,
        payloadHash: provenDecision.outcome.recordHash, evidenceSourceRefIds: provenDecision.outcome.evidenceSourceRefIds
      }
    }
  ];
  const buildProven = ({ wikiPage = provenPage, revisionRows = revisions, receiptRows = receipts, filter = 'reviewed' } = {}) => buildDecisionIndex({
    userId: USER_ID,
    filter,
    asOf,
    models: { ...models, WikiPage: modelFor([wikiPage]), WikiRevision: modelFor(revisionRows), NoeisReceipt: modelFor(receiptRows) }
  });
  const proven = await buildProven();
  assert.strictEqual(proven.items[0].continuity.complete, true);
  assert.strictEqual(proven.items[0].continuity.acceptedRevisionId, acceptedRevisionId);
  assert.deepStrictEqual(proven.items[0].outcome.evidence.map(ref => ref.id), [ARTICLE_ID]);
  assert.strictEqual(proven.items[0].outcome.state, 'observed');
  assert.deepStrictEqual(proven.items[0].continuity.missing, []);

  const directlyTakenDecision = { ...clone(recordedDecision), status: 'taken', decidedAt: decisionAcceptedAt };
  const directlyReviewedDecision = { ...clone(provenDecision), decidedAt: decisionAcceptedAt };
  const directlyRecordedPage = { ...clone(recordedPage), judgment: { ...clone(recordedPage.judgment), decisions: [directlyTakenDecision] } };
  const directlyReviewedPage = { ...clone(provenPage), judgment: { ...clone(provenPage.judgment), decisions: [directlyReviewedDecision] } };
  const directlyTakenRevisions = revisions
    .filter(revision => ![recordedRevisionId, transitionRevisionId, outcomeRevisionId].includes(revision._id))
    .concat([
      { _id: recordedRevisionId, userId: USER_ID, pageId: PAGE_ID, actorType: 'user', promotionStatus: 'promoted', before: acceptedBasis, after: directlyRecordedPage },
      { _id: outcomeRevisionId, userId: USER_ID, pageId: PAGE_ID, actorType: 'user', promotionStatus: 'promoted', before: directlyRecordedPage, after: directlyReviewedPage }
    ]);
  const directlyTakenReceipts = clone(receipts).filter(receipt => receipt.receiptId !== transitionReceiptId);
  directlyTakenReceipts.find(receipt => receipt.receiptId === 'decision-receipt').provenance.acceptedStatus = 'taken';
  const directlyTaken = await buildProven({
    wikiPage: directlyReviewedPage,
    revisionRows: directlyTakenRevisions,
    receiptRows: directlyTakenReceipts
  });
  assert.strictEqual(directlyTaken.items[0].continuity.complete, true, 'directly accepted taken decisions need no transition receipt');
  assert.strictEqual(directlyTaken.items[0].outcome.state, 'observed');

  const tamperedPage = JSON.parse(JSON.stringify(provenPage));
  tamperedPage.judgment.decisions[0].outcome.lesson = 'Silently changed lesson.';
  const tampered = await buildDecisionIndex({
    userId: USER_ID,
    filter: 'reviewed',
    asOf,
    models: { ...models, WikiPage: modelFor([tamperedPage]), WikiRevision: modelFor(revisions), NoeisReceipt: modelFor(receipts) }
  });
  assert.strictEqual(tampered.items[0].continuity.complete, false);
  assert.ok(tampered.items[0].continuity.missing.includes('outcome_receipt_integrity'));

  const unrelatedRevisionPage = JSON.parse(JSON.stringify(provenPage));
  unrelatedRevisionPage.judgment.decisions = [baseDecision('another-decision')];
  for (const revisionToSwap of [recordedRevisionId, outcomeRevisionId]) {
    const swappedRevisions = revisions.map(revision => (
      revision._id === revisionToSwap
        ? { ...revision, after: unrelatedRevisionPage }
        : revision
    ));
    const swapped = await buildProven({ revisionRows: swappedRevisions });
    assert.strictEqual(swapped.items[0].continuity.complete, false);
    assert.ok(swapped.items[0].continuity.missing.includes(
      revisionToSwap === recordedRevisionId
        ? 'recorded_revision_integrity'
        : 'outcome_receipt_integrity'
    ));
  }

  const receiptTamperCases = [
    ['decision-receipt', 'action', 'wrong_action'],
    ['decision-receipt', 'pageId', OTHER_PAGE_ID],
    ['decision-receipt', 'decisionId', 'another-decision'],
    ['decision-receipt', 'acceptedRevisionId', outcomeRevisionId],
    ['decision-receipt', 'recordedRevisionId', outcomeRevisionId],
    ['decision-receipt', 'requestId', ''],
    ['decision-receipt', 'acceptedRevisionDisposition', 'preserved'],
    ['decision-receipt', 'acceptedStatus', 'taken'],
    ['decision-receipt', 'immutableSnapshotHash', 'wrong-hash'],
    ['decision-receipt', 'basisPageHash', 'wrong-hash'],
    ['decision-receipt', 'relatedClaimIds', ['another-claim']],
    ['decision-receipt', 'sourceRefIds', ['another-source']],
    ['decision-receipt', 'reviewAt', '2027-01-01T00:00:00.000Z'],
    ['decision-receipt', 'outcomeDueAt', '2027-01-01T00:00:00.000Z'],
    ['outcome-receipt', 'action', 'wrong_action'],
    ['outcome-receipt', 'pageId', OTHER_PAGE_ID],
    ['outcome-receipt', 'decisionId', 'another-decision'],
    ['outcome-receipt', 'revisionId', recordedRevisionId],
    ['outcome-receipt', 'acceptedRevisionId', outcomeRevisionId],
    ['outcome-receipt', 'decisionSnapshotHash', 'wrong-hash'],
    ['outcome-receipt', 'payloadHash', 'wrong-hash'],
    ['outcome-receipt', 'evidenceSourceRefIds', ['another-source']]
  ];
  for (const [receiptId, field, value] of receiptTamperCases) {
    const tamperedReceipts = JSON.parse(JSON.stringify(receipts));
    const target = tamperedReceipts.find(receipt => receipt.receiptId === receiptId);
    target.provenance[field] = value;
    const result = await buildProven({ receiptRows: tamperedReceipts });
    assert.strictEqual(
      result.items[0].continuity.complete,
      false,
      `${receiptId}.${field} must be continuity-bound`
    );
  }
  for (const [receiptId, mutate] of [
    ['decision-receipt', receipt => { receipt.source = 'other'; }],
    ['decision-receipt', receipt => { receipt.completedAt = '2026-07-22T00:00:00.000Z'; }],
    ['decision-receipt', receipt => { receipt.provenance.version = 2; }],
    ['decision-receipt', receipt => { receipt.touched = []; }],
    ['outcome-receipt', receipt => { receipt.source = 'other'; }],
    ['outcome-receipt', receipt => { receipt.completedAt = '2026-07-31T00:00:00.000Z'; }],
    ['outcome-receipt', receipt => { receipt.provenance.version = 2; }],
    ['outcome-receipt', receipt => { receipt.touched = []; }],
    [dispositionReceiptId, receipt => { receipt.provenance.retainedCandidateHash = 'wrong-hash'; }]
  ]) {
    const tamperedReceipts = clone(receipts);
    mutate(tamperedReceipts.find(receipt => receipt.receiptId === receiptId));
    const result = await buildProven({ receiptRows: tamperedReceipts });
    assert.strictEqual(result.items[0].continuity.complete, false, `${receiptId} envelope must be continuity-bound`);
    assert.notStrictEqual(result.items[0].outcome.state, 'observed');
  }

  for (const mutate of [
    receiptsToMutate => receiptsToMutate.splice(receiptsToMutate.findIndex(receipt => receipt.receiptId === transitionReceiptId), 1),
    receiptsToMutate => { receiptsToMutate.find(receipt => receipt.receiptId === transitionReceiptId).completedAt = '2026-07-22T00:00:00.000Z'; },
    receiptsToMutate => { receiptsToMutate.find(receipt => receipt.receiptId === transitionReceiptId).provenance.revisionId = recordedRevisionId; },
    receiptsToMutate => { receiptsToMutate.find(receipt => receipt.receiptId === transitionReceiptId).provenance.immutableSnapshotHash = 'wrong-hash'; }
  ]) {
    const tamperedReceipts = clone(receipts);
    mutate(tamperedReceipts);
    const result = await buildProven({ receiptRows: tamperedReceipts });
    assert.strictEqual(result.items[0].continuity.complete, false, 'take transition must be receipt-bound');
    assert.ok(result.items[0].continuity.missing.includes('decision_transition_integrity'));
  }

  const forgedTakenPage = clone(recordedPage);
  forgedTakenPage.judgment.decisions[0].status = 'taken';
  forgedTakenPage.judgment.decisions[0].decidedAt = '2099-01-01T00:00:00.000Z';
  const forgedTaken = await buildProven({ wikiPage: forgedTakenPage, receiptRows: receipts.filter(receipt => receipt.receiptId !== transitionReceiptId), filter: 'awaiting_outcome' });
  assert.strictEqual(forgedTaken.items[0].continuity.complete, false);
  assert.ok(forgedTaken.items[0].continuity.missing.includes('decision_transition_integrity'));

  const driftedAcceptancePage = clone(provenPage);
  driftedAcceptancePage.judgment.decisions[0].acceptedAt = '2026-07-22T00:00:00.000Z';
  const driftedAcceptance = await buildProven({ wikiPage: driftedAcceptancePage });
  assert.strictEqual(driftedAcceptance.items[0].continuity.complete, false);
  assert.ok(driftedAcceptance.items[0].continuity.missing.includes('recorded_revision_integrity'));

  const driftedOutcomeClockPage = clone(provenPage);
  driftedOutcomeClockPage.judgment.decisions[0].outcome.reviewedAt = '2026-07-31T00:00:00.000Z';
  const driftedOutcomeClock = await buildProven({ wikiPage: driftedOutcomeClockPage });
  assert.strictEqual(driftedOutcomeClock.items[0].continuity.complete, false);
  assert.strictEqual(driftedOutcomeClock.items[0].outcome.state, 'review_incomplete');

  const impossibleClockPage = clone(provenPage);
  impossibleClockPage.judgment.decisions[0].outcome.observedAt = '2026-07-18T00:00:00.000Z';
  impossibleClockPage.judgment.decisions[0].outcome.recordHash = outcomeRecordHash(impossibleClockPage.judgment.decisions[0].outcome);
  const impossibleClockRevisions = clone(revisions);
  const impossibleOutcomeRevision = impossibleClockRevisions.find(revision => revision._id === outcomeRevisionId);
  impossibleOutcomeRevision.after = clone(impossibleClockPage);
  const impossibleClockReceipts = clone(receipts);
  impossibleClockReceipts.find(receipt => receipt.receiptId === 'outcome-receipt').provenance.payloadHash = impossibleClockPage.judgment.decisions[0].outcome.recordHash;
  const impossibleClock = await buildProven({
    wikiPage: impossibleClockPage,
    revisionRows: impossibleClockRevisions,
    receiptRows: impossibleClockReceipts
  });
  assert.strictEqual(impossibleClock.items[0].continuity.complete, false);
  assert.strictEqual(impossibleClock.items[0].outcome.state, 'review_incomplete');

  const withImpossibleDecisionClock = mutate => {
    const wikiPage = clone(provenPage);
    const revisionRows = clone(revisions);
    const receiptRows = clone(receipts);
    const allDecisions = [wikiPage, ...revisionRows.flatMap(revision => [revision.before, revision.after])]
      .filter(Boolean)
      .flatMap(snapshot => snapshot?.judgment?.decisions || [])
      .filter(candidate => candidate.decisionId === 'proven');
    allDecisions.forEach(mutate);
    const immutableHash = immutableDecisionHash(wikiPage.judgment.decisions[0]);
    allDecisions.forEach(candidate => {
      candidate.immutableSnapshotHash = immutableHash;
      if (candidate.outcome?.decisionSnapshotHash) candidate.outcome.decisionSnapshotHash = immutableHash;
    });
    const decisionReceipt = receiptRows.find(receipt => receipt.receiptId === 'decision-receipt');
    decisionReceipt.provenance.immutableSnapshotHash = immutableHash;
    decisionReceipt.provenance.reviewAt = wikiPage.judgment.decisions[0].reviewAt;
    decisionReceipt.provenance.outcomeDueAt = wikiPage.judgment.decisions[0].outcomeDueAt;
    receiptRows.find(receipt => receipt.receiptId === transitionReceiptId).provenance.immutableSnapshotHash = immutableHash;
    receiptRows.find(receipt => receipt.receiptId === 'outcome-receipt').provenance.decisionSnapshotHash = immutableHash;
    return { wikiPage, revisionRows, receiptRows };
  };
  for (const fixture of [
    withImpossibleDecisionClock(decision => { decision.reviewAt = '2026-07-19T00:00:00.000Z'; }),
    withImpossibleDecisionClock(decision => { decision.outcomeDueAt = '2026-07-19T00:00:00.000Z'; })
  ]) {
    const result = await buildProven(fixture);
    assert.strictEqual(result.items[0].continuity.complete, false, 'decision clocks must follow acceptance');
    assert.strictEqual(result.items[0].outcome.state, 'review_incomplete');
  }

  const lateDispositionRevisions = clone(revisions);
  const lateDispositionReceipts = clone(receipts);
  const lateDispositionAt = '2026-07-22T00:00:00.000Z';
  const lateAcceptedRevision = lateDispositionRevisions.find(revision => revision._id === acceptedRevisionId);
  lateAcceptedRevision.claimReview.reviewedAt = lateDispositionAt;
  lateAcceptedRevision.claimReview.events.at(-1).at = lateDispositionAt;
  lateAcceptedRevision.claimReview.receipt.completedAt = lateDispositionAt;
  lateDispositionReceipts.find(receipt => receipt.receiptId === dispositionReceiptId).completedAt = lateDispositionAt;
  const lateDisposition = await buildProven({ revisionRows: lateDispositionRevisions, receiptRows: lateDispositionReceipts });
  assert.strictEqual(lateDisposition.items[0].continuity.complete, false, 'judgment acceptance must precede decision acceptance');
  assert.strictEqual(lateDisposition.items[0].outcome.state, 'review_incomplete');
  const driftedPage = JSON.parse(JSON.stringify(provenPage));
  driftedPage.claims[0].text = 'Current claim silently drifted from the accepted basis.';
  const drifted = await buildDecisionIndex({
    userId: USER_ID,
    filter: 'reviewed',
    asOf,
    models: { ...models, WikiPage: modelFor([driftedPage]), WikiRevision: modelFor(revisions), NoeisReceipt: modelFor(receipts) }
  });
  assert.strictEqual(drifted.items[0].continuity.complete, false);
  assert.ok(drifted.items[0].continuity.missing.includes('accepted_basis_link_drift'));

  const ambiguousPage = JSON.parse(JSON.stringify(page));
  ambiguousPage.judgment.decisions = [baseDecision('ambiguous', {
    reviewAt: '2026-08-02T12:00:00.000Z',
    relatedClaimIds: ['claim-1', 'claim-1'],
    sourceRefIds: [SOURCE_REF_ID, SOURCE_REF_ID]
  })];
  ambiguousPage.claims.push({ claimId: 'claim-1', text: 'Conflicting duplicate claim.' });
  ambiguousPage.sourceRefs.push({ _id: SOURCE_REF_ID, type: 'article', objectId: ARTICLE_ID, title: 'Duplicate source ref' });
  const ambiguous = await buildDecisionIndex({ userId: USER_ID, filter: 'all', asOf, models: { ...models, WikiPage: modelFor([ambiguousPage]) } });
  assert.deepStrictEqual(ambiguous.items[0].links.claims.resolved, []);
  assert.deepStrictEqual(ambiguous.items[0].links.sources.resolved, []);
  assert.ok(ambiguous.items[0].continuity.missing.includes('ambiguous_claim_ids'));
  assert.ok(ambiguous.items[0].continuity.missing.includes('ambiguous_source_ref_ids'));

  const malformedDatePage = clone(page);
  malformedDatePage.judgment.decisions = [baseDecision('malformed-date', {
    status: 'reviewed',
    reviewAt: 'not-a-date',
    immutableSnapshotHash: 'retained-but-invalid',
    outcome: {
      observedAt: 'also-not-a-date',
      summary: 'Unverified narrative.',
      result: 'unknown',
      reviewedAt: 'still-not-a-date'
    }
  })];
  const malformedDates = await buildDecisionIndex({
    userId: USER_ID,
    filter: 'reviewed',
    asOf,
    models: { ...models, WikiPage: modelFor([malformedDatePage]) }
  });
  assert.strictEqual(malformedDates.items.length, 1);
  assert.strictEqual(malformedDates.items[0].continuity.complete, false);
  assert.strictEqual(malformedDates.items[0].outcome.state, 'review_incomplete');
  assert.strictEqual(malformedDates.items[0].outcome.observedAt, null);

  assert.throws(() => __testables.decodeCursor('not-a-cursor'), error => error instanceof DecisionIndexError && error.code === 'invalid_cursor');
  console.log('decisionIndexService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
