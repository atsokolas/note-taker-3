const crypto = require('crypto');
const { createWikiRevision, snapshotContentHash, snapshotPage } = require('./wikiRevisionService');
const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');
const {
  assertClaimDispositionReplayReceipt,
  assertOwnedVisibleEvidence
} = require('./wikiClaimDispositionService');

const DECISION_TYPES = new Set(['research', 'outreach', 'product', 'operating', 'investment', 'no_action', 'close']);
const RESULTS = new Set(['positive', 'negative', 'mixed', 'unknown']);
const CREATE_STATUSES = new Set(['planned', 'taken']);
const TRANSITIONS = Object.freeze({ take: ['planned'], cancel: ['planned', 'taken'] });

class DecisionMutationError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'DecisionMutationError';
    this.status = status;
    this.code = code;
  }
}

const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const id = value => String(value?._id || value?.id || value || '').trim();
const list = value => Array.isArray(value) ? value : [];
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const clone = value => JSON.parse(JSON.stringify(value ?? null));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique = values => Array.from(new Set(list(values).map(id).filter(Boolean)));
const sameIds = (left, right) => JSON.stringify(list(left).map(id).filter(Boolean).sort())
  === JSON.stringify(list(right).map(id).filter(Boolean).sort());
const iso = value => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const queryInSession = (query, session) => query?.session ? query.session(session) : query;
const resolveQuery = query => query?.then ? query : Promise.resolve(query);
const dateValue = (value, field, { required = false, future = false, now = new Date() } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw new DecisionMutationError(`${field} is required.`);
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new DecisionMutationError(`${field} must be a valid date.`);
  if (future && date <= now) throw new DecisionMutationError(`${field} must be in the future.`);
  return date;
};
const safeObjectId = (WikiRevision) => {
  const ObjectId = WikiRevision?.db?.base?.Types?.ObjectId;
  if (!ObjectId) throw new DecisionMutationError('Wiki revision identity is unavailable.', 503, 'unavailable');
  return new ObjectId();
};

const immutableDecisionSnapshot = decision => ({
  decisionId: clean(decision?.decisionId, 160),
  decisionType: clean(decision?.decisionType, 80),
  summary: clean(decision?.summary, 2000),
  rationale: clean(decision?.rationale, 4000),
  expectedOutcome: clean(decision?.expectedOutcome, 4000),
  horizon: clean(decision?.horizon, 500),
  successCriteria: list(decision?.successCriteria).map(value => clean(value, 500)).filter(Boolean),
  reviewAt: decision?.reviewAt ? new Date(decision.reviewAt).toISOString() : null,
  outcomeDueAt: decision?.outcomeDueAt ? new Date(decision.outcomeDueAt).toISOString() : null,
  relatedClaimIds: unique(decision?.relatedClaimIds),
  sourceRefIds: unique(decision?.sourceRefIds),
  acceptedRevisionId: id(decision?.acceptedRevisionId),
  acceptedRevisionDisposition: clean(decision?.acceptedRevisionDisposition, 40),
  basisPageHash: clean(decision?.basisPageHash, 128)
});
const immutableDecisionHash = decision => digest(immutableDecisionSnapshot(decision));
const acceptedDecisionProvenance = decision => ({
  acceptedRevisionId: id(decision?.acceptedRevisionId),
  acceptedRevisionDisposition: clean(decision?.acceptedRevisionDisposition, 40),
  recordedRevisionId: id(decision?.recordedRevisionId),
  receiptId: clean(decision?.receiptId, 300),
  immutableSnapshotHash: clean(decision?.immutableSnapshotHash, 128),
  acceptedAt: iso(decision?.acceptedAt),
  acceptedBy: clean(decision?.acceptedBy, 40),
  createdAt: iso(decision?.createdAt),
  createdBy: clean(decision?.createdBy, 40),
  basisPageHash: clean(decision?.basisPageHash, 128)
});
const sameAcceptedDecisionProvenance = (left, right) => (
  JSON.stringify(acceptedDecisionProvenance(left)) === JSON.stringify(acceptedDecisionProvenance(right))
);
const outcomeRecordSnapshot = outcome => ({
  observedAt: outcome?.observedAt ? new Date(outcome.observedAt).toISOString() : null,
  summary: clean(outcome?.summary, 4000),
  result: clean(outcome?.result, 40),
  processScore: outcome?.processScore === null || outcome?.processScore === undefined
    ? null : Number(outcome.processScore),
  calibrationNote: clean(outcome?.calibrationNote, 4000),
  lesson: clean(outcome?.lesson, 4000),
  evidenceSourceRefIds: unique(outcome?.evidenceSourceRefIds)
});
const outcomeRecordHash = outcome => digest(outcomeRecordSnapshot(outcome));

const comparableDecision = decision => ({
  ...immutableDecisionSnapshot(decision),
  status: clean(decision?.status, 40),
  decidedAt: decision?.decidedAt ? new Date(decision.decidedAt).toISOString() : null,
  acceptedAt: decision?.acceptedAt ? new Date(decision.acceptedAt).toISOString() : null,
  acceptedBy: clean(decision?.acceptedBy, 40),
  recordedRevisionId: id(decision?.recordedRevisionId),
  receiptId: clean(decision?.receiptId, 300),
  immutableSnapshotHash: clean(decision?.immutableSnapshotHash, 128),
  createdAt: decision?.createdAt ? new Date(decision.createdAt).toISOString() : null,
  createdBy: clean(decision?.createdBy, 40),
  outcome: {
    observedAt: decision?.outcome?.observedAt ? new Date(decision.outcome.observedAt).toISOString() : null,
    reviewedAt: decision?.outcome?.reviewedAt ? new Date(decision.outcome.reviewedAt).toISOString() : null,
    reviewedBy: clean(decision?.outcome?.reviewedBy, 40),
    revisionId: id(decision?.outcome?.revisionId),
    receiptId: clean(decision?.outcome?.receiptId, 300),
    decisionSnapshotHash: clean(decision?.outcome?.decisionSnapshotHash, 128),
    recordHash: clean(decision?.outcome?.recordHash, 128),
    summary: clean(decision?.outcome?.summary, 4000),
    result: clean(decision?.outcome?.result, 40) || 'unknown',
    processScore: decision?.outcome?.processScore ?? null,
    calibrationNote: clean(decision?.outcome?.calibrationNote, 4000),
    lesson: clean(decision?.outcome?.lesson, 4000),
    evidenceSourceRefIds: unique(decision?.outcome?.evidenceSourceRefIds)
  }
});

const assertNoGenericDecisionMutation = ({ previous = [], next = [] } = {}) => {
  const before = list(previous).map(comparableDecision);
  const after = list(next).map(comparableDecision);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new DecisionMutationError(
      'Decision records must be changed through the human decision controls.',
      409,
      'transactional_decision_required'
    );
  }
};

const humanAcceptedRevision = revision => {
  const disposition = clean(revision?.claimReview?.state, 40);
  return Boolean(
    revision
    && revision.promotionStatus === (disposition === 'preserved' ? 'preserved' : 'promoted')
    && revision.snapshotPrunedAt == null
    && (disposition === 'accepted' ? revision.after : disposition === 'preserved' ? revision.before : null)
    && ['accepted', 'preserved'].includes(disposition)
    && list(revision?.claimReview?.events).some(event => (
      clean(event?.action, 40) === (disposition === 'accepted' ? 'accept' : 'preserve')
      && clean(event?.receiptId, 300)
    ))
  );
};
const acceptedRevisionBasis = revision => (
  clean(revision?.claimReview?.state, 40) === 'preserved' ? plain(revision?.before) : plain(revision?.after)
);

const assertDispositionReceipt = async ({ revision, NoeisReceipt, userId, pageId, session }) => {
  const disposition = clean(revision?.claimReview?.state, 40);
  const expectedAction = disposition === 'accepted' ? 'accept' : 'preserve';
  const event = [...list(revision?.claimReview?.events)].reverse().find(item => clean(item?.action, 40) === expectedAction);
  const receiptId = clean(event?.receiptId, 300);
  const stored = receiptId ? await loadStoredReceipt({ NoeisReceipt, userId, receiptId, session }) : null;
  const raw = plain(stored);
  try {
    assertClaimDispositionReplayReceipt({
      storedReceipt: raw,
      revision,
      action: expectedAction,
      page: { _id: pageId || revision?.pageId }
    });
  } catch (_error) {
    throw new DecisionMutationError('Accepted revision is missing its matching durable human disposition receipt.', 409, 'revision_receipt_missing');
  }
  return { disposition, receiptId, completedAt: iso(raw?.completedAt) };
};

const assertExactLinks = ({ page, relatedClaimIds, sourceRefIds, evidenceSourceRefIds = [] }) => {
  const claimCounts = new Map();
  list(page?.claims).forEach(claim => {
    const claimId = clean(claim?.claimId, 160);
    if (claimId) claimCounts.set(claimId, (claimCounts.get(claimId) || 0) + 1);
  });
  const sourceCounts = new Map();
  list(page?.sourceRefs).forEach(ref => {
    const sourceRefId = id(ref);
    if (sourceRefId) sourceCounts.set(sourceRefId, (sourceCounts.get(sourceRefId) || 0) + 1);
  });
  if (unique(relatedClaimIds).some(claimId => claimCounts.get(claimId) !== 1)) {
    throw new DecisionMutationError('Every related claim must resolve exactly once on this Wiki page.', 409, 'unresolved_claim');
  }
  if ([...unique(sourceRefIds), ...unique(evidenceSourceRefIds)].some(sourceRefId => sourceCounts.get(sourceRefId) !== 1)) {
    throw new DecisionMutationError('Every evidence reference must resolve exactly once on this Wiki page.', 409, 'unresolved_evidence');
  }
};

const sourceRefsForIds = (page, sourceRefIds) => {
  const byId = new Map(list(page?.sourceRefs).map(ref => [id(ref), ref]));
  return unique(sourceRefIds).map(sourceRefId => byId.get(sourceRefId)).filter(Boolean);
};
const assertOwnedEvidence = async ({ page, sourceRefIds, userId, session, models }) => {
  await assertOwnedVisibleEvidence({
    validation: { newlyLinkedSourceRefs: sourceRefsForIds(page, sourceRefIds) },
    userId,
    session,
    ...models
  });
};

const loadStoredReceipt = async ({ NoeisReceipt, userId, receiptId, session }) => {
  if (!NoeisReceipt?.findOne) return null;
  return resolveQuery(queryInSession(NoeisReceipt.findOne({ userId, receiptId }), session));
};
const receiptIdOf = receipt => clean(receipt?.receiptId || receipt?.id, 300);
const assertReceiptEnvelope = ({ stored, receiptId, kind, action, pageId, decisionId, code }) => {
  const raw = plain(stored);
  const provenance = plain(raw?.provenance) || {};
  const touched = list(raw?.touched);
  if (!raw
    || receiptIdOf(raw) !== receiptId
    || clean(raw.kind, 100) !== kind
    || clean(raw.source, 40) !== 'wiki'
    || clean(raw.status, 40) !== 'completed'
    || !iso(raw.completedAt)
    || Number(provenance.version) !== 1
    || clean(provenance.action, 80) !== action
    || id(provenance.pageId) !== pageId
    || clean(provenance.decisionId, 160) !== decisionId
    || !touched.some(item => clean(item?.type, 80) === 'wiki_page' && id(item?.id) === pageId)) {
    throw new DecisionMutationError('Decision replay receipt failed its integrity contract.', 409, code);
  }
  return { raw, provenance, touched };
};
const decisionFromSnapshot = (snapshot, decisionId) => list(snapshot?.judgment?.decisions)
  .find(decision => clean(decision?.decisionId, 160) === decisionId);
const loadDecisionRevision = async ({
  WikiRevision, userId, pageId, revisionId, decisionId, session, code
}) => {
  const safeRevisionId = id(revisionId);
  const revision = safeRevisionId
    ? await resolveQuery(queryInSession(WikiRevision.findOne({
      _id: safeRevisionId,
      pageId,
      userId
    }), session))
    : null;
  if (!revision
    || revision.snapshotPrunedAt != null
    || clean(revision.actorType, 40) !== 'user'
    || clean(revision.promotionStatus, 40) !== 'promoted'
    || !decisionFromSnapshot(plain(revision.after), decisionId)) {
    throw new DecisionMutationError('Decision replay revision failed its integrity contract.', 409, code);
  }
  return revision;
};
const receiptIdForCreate = (pageId, decisionId) => `wiki-decision:v1:${pageId}:${decisionId}:accepted`;
const receiptIdForTransition = (pageId, decisionId, action) => `wiki-decision:v1:${pageId}:${decisionId}:${action}`;
const receiptIdForOutcome = (pageId, decisionId) => `wiki-decision:v1:${pageId}:${decisionId}:outcome`;
const requireModels = ({ WikiPage, WikiRevision, NoeisReceipt }) => {
  if (!WikiPage || !WikiRevision || !NoeisReceipt) {
    throw new DecisionMutationError('Decision persistence models are unavailable.', 503, 'unavailable');
  }
  if (typeof WikiPage?.db?.startSession !== 'function') {
    throw new DecisionMutationError('Decision writes require MongoDB transaction support.', 503, 'transactions_required');
  }
};
const findDecision = (page, decisionId) => list(page?.judgment?.decisions)
  .find(decision => clean(decision?.decisionId, 160) === clean(decisionId, 160));
const assertDecisionIntegrity = decision => {
  if (!decision?.acceptedRevisionId || !decision?.immutableSnapshotHash || immutableDecisionHash(decision) !== decision.immutableSnapshotHash) {
    throw new DecisionMutationError('Decision provenance is incomplete or its accepted rationale changed.', 409, 'decision_integrity_failed');
  }
};

const assertAcceptedDecisionReplay = async ({
  stored, receiptId, requestId, pageId, decisionId, acceptedRevisionId,
  requestedStatus, decision, WikiRevision, NoeisReceipt, userId, session
}) => {
  assertDecisionIntegrity(decision);
  const { raw, provenance, touched } = assertReceiptEnvelope({
    stored,
    receiptId,
    kind: 'wiki_decision_accepted',
    action: 'accept_decision',
    pageId,
    decisionId,
    code: 'decision_receipt_integrity_failed'
  });
  const recordedRevisionId = id(decision.recordedRevisionId);
  if (decision.receiptId !== receiptId
    || clean(provenance.requestId, 160) !== requestId
    || id(provenance.acceptedRevisionId) !== acceptedRevisionId
    || id(provenance.recordedRevisionId) !== recordedRevisionId
    || clean(provenance.acceptedRevisionDisposition, 40) !== clean(decision.acceptedRevisionDisposition, 40)
    || clean(provenance.acceptedStatus, 40) !== requestedStatus
    || clean(provenance.immutableSnapshotHash, 128) !== decision.immutableSnapshotHash
    || clean(provenance.basisPageHash, 128) !== clean(decision.basisPageHash, 128)
    || !sameIds(provenance.relatedClaimIds, decision.relatedClaimIds)
    || !sameIds(provenance.sourceRefIds, decision.sourceRefIds)
    || iso(provenance.reviewAt) !== iso(decision.reviewAt)
    || iso(provenance.outcomeDueAt) !== iso(decision.outcomeDueAt)
    || !iso(decision.reviewAt)
    || new Date(decision.reviewAt) <= new Date(raw.completedAt)
    || (iso(decision.outcomeDueAt) && new Date(decision.outcomeDueAt) <= new Date(raw.completedAt))
    || !touched.some(item => clean(item?.type, 80) === 'wiki_revision' && id(item?.id) === recordedRevisionId)) {
    throw new DecisionMutationError('Decision acceptance receipt is incomplete or mismatched.', 409, 'decision_receipt_integrity_failed');
  }
  const recordedRevision = await loadDecisionRevision({
    WikiRevision, userId, pageId, revisionId: recordedRevisionId, decisionId, session,
    code: 'decision_receipt_integrity_failed'
  });
  const recordedDecision = decisionFromSnapshot(plain(recordedRevision.after), decisionId);
  if (clean(recordedDecision?.status, 40) !== requestedStatus
    || immutableDecisionHash(recordedDecision) !== decision.immutableSnapshotHash
    || clean(recordedDecision?.receiptId, 300) !== receiptId
    || id(recordedDecision?.recordedRevisionId) !== recordedRevisionId
    || id(recordedDecision?.acceptedRevisionId) !== acceptedRevisionId
    || clean(recordedDecision?.acceptedRevisionDisposition, 40) !== clean(decision.acceptedRevisionDisposition, 40)
    || clean(recordedDecision?.acceptedBy, 40) !== 'user'
    || clean(recordedDecision?.createdBy, 40) !== 'user'
    || iso(recordedDecision?.acceptedAt) !== iso(plain(stored)?.completedAt)
    || iso(recordedDecision?.createdAt) !== iso(plain(stored)?.completedAt)
    || (requestedStatus === 'taken' && iso(recordedDecision?.decidedAt) !== iso(plain(stored)?.completedAt))
    || (requestedStatus === 'planned' && iso(recordedDecision?.decidedAt) !== null)
    || clean(recordedDecision?.basisPageHash, 128) !== clean(decision.basisPageHash, 128)
    || clean(recordedDecision?.immutableSnapshotHash, 128) !== decision.immutableSnapshotHash
    || !sameAcceptedDecisionProvenance(recordedDecision, decision)) {
    throw new DecisionMutationError('Decision record revision disagrees with its receipt.', 409, 'decision_receipt_integrity_failed');
  }
  const basisRevision = await resolveQuery(queryInSession(WikiRevision.findOne({
    _id: acceptedRevisionId,
    pageId,
    userId
  }), session));
  if (!humanAcceptedRevision(basisRevision)) {
    throw new DecisionMutationError('Decision acceptance basis is no longer retained.', 409, 'decision_receipt_integrity_failed');
  }
  const dispositionProof = await assertDispositionReceipt({
    revision: basisRevision,
    NoeisReceipt,
    userId,
    pageId,
    session
  });
  if (!dispositionProof.completedAt || new Date(dispositionProof.completedAt) > new Date(raw.completedAt)) {
    throw new DecisionMutationError('Decision acceptance predates its accepted judgment.', 409, 'decision_receipt_integrity_failed');
  }
};

const assertTransitionReplay = async ({
  stored, receiptId, action, pageId, decisionId, decision, WikiRevision, userId, session
}) => {
  const targetStatus = action === 'take' ? 'taken' : 'cancelled';
  const { raw, provenance, touched } = assertReceiptEnvelope({
    stored,
    receiptId,
    kind: `wiki_decision_${targetStatus}`,
    action,
    pageId,
    decisionId,
    code: 'transition_receipt_integrity_failed'
  });
  const revisionId = id(provenance.revisionId);
  if (clean(decision.status, 40) !== targetStatus
    || clean(provenance.immutableSnapshotHash, 128) !== decision.immutableSnapshotHash
    || !revisionId
    || !touched.some(item => clean(item?.type, 80) === 'wiki_revision' && id(item?.id) === revisionId)
    || (action === 'take' && iso(raw.completedAt) !== iso(decision.decidedAt))) {
    throw new DecisionMutationError('Decision transition receipt is incomplete or mismatched.', 409, 'transition_receipt_integrity_failed');
  }
  const revision = await loadDecisionRevision({
    WikiRevision, userId, pageId, revisionId, decisionId, session,
    code: 'transition_receipt_integrity_failed'
  });
  const beforeDecision = decisionFromSnapshot(plain(revision.before), decisionId);
  const afterDecision = decisionFromSnapshot(plain(revision.after), decisionId);
  if (!TRANSITIONS[action].includes(clean(beforeDecision?.status, 40))
    || clean(afterDecision?.status, 40) !== targetStatus
    || immutableDecisionHash(beforeDecision) !== decision.immutableSnapshotHash
    || immutableDecisionHash(afterDecision) !== decision.immutableSnapshotHash
    || !sameAcceptedDecisionProvenance(beforeDecision, decision)
    || !sameAcceptedDecisionProvenance(afterDecision, decision)
    || (action === 'take' && (iso(beforeDecision?.decidedAt) !== null
      || iso(afterDecision?.decidedAt) !== iso(raw.completedAt)
      || iso(afterDecision?.decidedAt) !== iso(decision.decidedAt)))
    || (action === 'cancel' && (iso(afterDecision?.decidedAt) !== iso(beforeDecision?.decidedAt)
      || iso(afterDecision?.decidedAt) !== iso(decision.decidedAt)))) {
    throw new DecisionMutationError('Decision transition revision disagrees with its receipt.', 409, 'transition_receipt_integrity_failed');
  }
};

const assertOutcomeReplay = async ({
  stored, receiptId, pageId, decisionId, decision, payloadHash, evidenceSourceRefIds,
  WikiRevision, userId, session
}) => {
  const { raw, provenance, touched } = assertReceiptEnvelope({
    stored,
    receiptId,
    kind: 'wiki_decision_outcome_recorded',
    action: 'record_outcome',
    pageId,
    decisionId,
    code: 'outcome_receipt_integrity_failed'
  });
  const outcome = plain(decision.outcome) || {};
  const revisionId = id(outcome.revisionId);
  const acceptedAt = iso(decision.acceptedAt);
  const decidedAt = iso(decision.decidedAt);
  const observedAt = iso(outcome.observedAt);
  const reviewedAt = iso(outcome.reviewedAt);
  if (clean(decision.status, 40) !== 'reviewed'
    || clean(outcome.reviewedBy, 40) !== 'user'
    || outcome.receiptId !== receiptId
    || outcomeRecordHash(outcome) !== outcome.recordHash
    || outcome.recordHash !== payloadHash
    || outcome.decisionSnapshotHash !== decision.immutableSnapshotHash
    || id(provenance.revisionId) !== revisionId
    || id(provenance.acceptedRevisionId) !== id(decision.acceptedRevisionId)
    || clean(provenance.decisionSnapshotHash, 128) !== decision.immutableSnapshotHash
    || clean(provenance.payloadHash, 128) !== payloadHash
    || !sameIds(provenance.evidenceSourceRefIds, evidenceSourceRefIds)
    || !sameIds(outcome.evidenceSourceRefIds, evidenceSourceRefIds)
    || iso(raw.completedAt) !== reviewedAt
    || !acceptedAt || !decidedAt || !observedAt || !reviewedAt
    || new Date(acceptedAt) > new Date(decidedAt)
    || new Date(decidedAt) > new Date(observedAt)
    || new Date(observedAt) > new Date(reviewedAt)
    || !touched.some(item => clean(item?.type, 80) === 'wiki_revision' && id(item?.id) === revisionId)) {
    throw new DecisionMutationError('Decision outcome receipt is incomplete or mismatched.', 409, 'outcome_receipt_integrity_failed');
  }
  const revision = await loadDecisionRevision({
    WikiRevision, userId, pageId, revisionId, decisionId, session,
    code: 'outcome_receipt_integrity_failed'
  });
  const beforeDecision = decisionFromSnapshot(plain(revision.before), decisionId);
  const afterDecision = decisionFromSnapshot(plain(revision.after), decisionId);
  const afterOutcome = plain(afterDecision?.outcome) || {};
  if (clean(beforeDecision?.status, 40) !== 'taken'
    || clean(afterDecision?.status, 40) !== 'reviewed'
    || immutableDecisionHash(beforeDecision) !== decision.immutableSnapshotHash
    || immutableDecisionHash(afterDecision) !== decision.immutableSnapshotHash
    || !sameAcceptedDecisionProvenance(beforeDecision, decision)
    || !sameAcceptedDecisionProvenance(afterDecision, decision)
    || outcomeRecordHash(afterOutcome) !== payloadHash
    || clean(afterOutcome.reviewedBy, 40) !== 'user'
    || iso(afterOutcome.reviewedAt) !== iso(raw.completedAt)
    || id(afterOutcome.revisionId) !== revisionId
    || clean(afterOutcome.receiptId, 300) !== receiptId
    || clean(afterOutcome.decisionSnapshotHash, 128) !== decision.immutableSnapshotHash
    || clean(afterOutcome.recordHash, 128) !== payloadHash
    || !sameIds(afterOutcome.evidenceSourceRefIds, evidenceSourceRefIds)) {
    throw new DecisionMutationError('Decision outcome revision disagrees with its receipt.', 409, 'outcome_receipt_integrity_failed');
  }
};

const persistReceipt = async ({ NoeisReceipt, userId, session, receipt }) => {
  const stored = await persistNoeisReceipt({ NoeisReceipt, userId, session, receipt });
  if (!stored) throw new DecisionMutationError('Decision receipt could not be persisted.', 500, 'receipt_failed');
  return stored;
};

const createAcceptedDecision = async ({
  userId, pageId, acceptedRevisionId, requestId, decision = {},
  WikiPage, WikiRevision, NoeisReceipt, Article, NotebookEntry, Question, TagMeta, now = () => new Date()
} = {}) => {
  requireModels({ WikiPage, WikiRevision, NoeisReceipt });
  const safeRequestId = clean(requestId, 160);
  const safePageId = id(pageId);
  const safeAcceptedRevisionId = id(acceptedRevisionId);
  if (!userId || !safePageId || !safeAcceptedRevisionId || !safeRequestId) {
    throw new DecisionMutationError('pageId, acceptedRevisionId, and requestId are required.');
  }
  if (decision.decisionId !== undefined && clean(decision.decisionId, 160)) {
    throw new DecisionMutationError('decisionId is server-generated from requestId.', 400, 'server_generated_identity');
  }
  const decisionId = `decision_${digest(`${userId}:${safePageId}:${safeRequestId}`).slice(0, 24)}`;
  const summary = clean(decision.summary, 2000);
  const rationale = clean(decision.rationale, 4000);
  const expectedOutcome = clean(decision.expectedOutcome, 4000);
  const decisionType = clean(decision.decisionType || 'research', 80).toLowerCase();
  const status = clean(decision.status || 'planned', 40).toLowerCase();
  if (!summary || !rationale || !expectedOutcome) {
    throw new DecisionMutationError('decision.summary, rationale, and expectedOutcome are required.');
  }
  if (!DECISION_TYPES.has(decisionType)) throw new DecisionMutationError('decision.decisionType is invalid.');
  if (!CREATE_STATUSES.has(status)) throw new DecisionMutationError('A decision may be accepted only as planned or taken.');
  const actedAt = now();
  const reviewAt = dateValue(decision.reviewAt, 'decision.reviewAt', { required: true, future: true, now: actedAt });
  const outcomeDueAt = dateValue(decision.outcomeDueAt, 'decision.outcomeDueAt', {
    future: decision.outcomeDueAt !== undefined && decision.outcomeDueAt !== null && decision.outcomeDueAt !== '',
    now: actedAt
  });
  const relatedClaimIds = unique(decision.relatedClaimIds);
  const sourceRefIds = unique(decision.sourceRefIds);
  if (!relatedClaimIds.length || !sourceRefIds.length) {
    throw new DecisionMutationError('At least one related claim and one owned source reference are required.');
  }
  const receiptId = receiptIdForCreate(safePageId, decisionId);
  const session = await WikiPage.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const page = await resolveQuery(queryInSession(WikiPage.findOne({ _id: safePageId, userId, status: { $ne: 'archived' } }), session));
      if (!page) throw new DecisionMutationError('Wiki page not found.', 404, 'not_found');
      const existing = findDecision(page, decisionId);
      if (existing) {
        const stored = await loadStoredReceipt({ NoeisReceipt, userId, receiptId, session });
        const requestedCore = {
          decisionId,
          decisionType,
          summary,
          rationale,
          expectedOutcome,
          horizon: clean(decision.horizon, 500),
          successCriteria: list(decision.successCriteria).map(value => clean(value, 500)).filter(Boolean).slice(0, 30),
          reviewAt: reviewAt ? reviewAt.toISOString() : null,
          outcomeDueAt: outcomeDueAt ? outcomeDueAt.toISOString() : null,
          relatedClaimIds,
          sourceRefIds,
          acceptedRevisionId: safeAcceptedRevisionId
        };
        const existingCore = {
          ...immutableDecisionSnapshot(existing),
          acceptedRevisionDisposition: undefined,
          basisPageHash: undefined
        };
        if (JSON.stringify(requestedCore) !== JSON.stringify(existingCore)) {
          throw new DecisionMutationError('Decision identity already exists with different accepted judgment.', 409, 'decision_conflict');
        }
        await assertAcceptedDecisionReplay({
          stored,
          receiptId,
          requestId: safeRequestId,
          pageId: safePageId,
          decisionId,
          acceptedRevisionId: safeAcceptedRevisionId,
          requestedStatus: status,
          decision: existing,
          WikiRevision,
          NoeisReceipt,
          userId,
          session
        });
        result = { idempotent: true, page, decision: existing, receipt: serializeStoredReceipt(stored) };
        return;
      }
      const revision = await resolveQuery(queryInSession(WikiRevision.findOne({ _id: safeAcceptedRevisionId, pageId: safePageId, userId }), session));
      if (!humanAcceptedRevision(revision)) {
        throw new DecisionMutationError('acceptedRevisionId must name a retained human-accepted revision for this page.', 409, 'revision_not_accepted');
      }
      const dispositionProof = await assertDispositionReceipt({
        revision,
        NoeisReceipt,
        userId,
        pageId: safePageId,
        session
      });
      const { disposition } = dispositionProof;
      if (!dispositionProof.completedAt || new Date(dispositionProof.completedAt) > actedAt) {
        throw new DecisionMutationError('acceptedRevisionId was accepted after this decision clock.', 409, 'revision_not_accepted');
      }
      const acceptedBasis = acceptedRevisionBasis(revision);
      assertExactLinks({ page: acceptedBasis, relatedClaimIds, sourceRefIds });
      assertExactLinks({ page, relatedClaimIds, sourceRefIds });
      await assertOwnedEvidence({
        page,
        sourceRefIds,
        userId,
        session,
        models: { WikiPage, Article, NotebookEntry, Question, TagMeta }
      });
      const before = snapshotPage(page);
      const recordedRevisionId = safeObjectId(WikiRevision);
      const record = {
        decisionId,
        decidedAt: status === 'taken' ? actedAt : null,
        decisionType,
        summary,
        rationale,
        expectedOutcome,
        horizon: clean(decision.horizon, 500),
        successCriteria: list(decision.successCriteria).map(value => clean(value, 500)).filter(Boolean).slice(0, 30),
        reviewAt,
        status,
        relatedClaimIds,
        sourceRefIds,
        acceptedRevisionId: revision._id,
        acceptedRevisionDisposition: disposition,
        recordedRevisionId,
        acceptedAt: actedAt,
        acceptedBy: 'user',
        basisPageHash: snapshotContentHash(acceptedBasis),
        receiptId,
        outcomeDueAt,
        outcome: {},
        createdAt: actedAt,
        createdBy: 'user'
      };
      record.immutableSnapshotHash = immutableDecisionHash(record);
      page.judgment.decisions = [...list(page.judgment.decisions), record];
      page.markModified?.('judgment.decisions');
      await page.save({ session });
      await createWikiRevision({
        WikiRevision, revisionId: recordedRevisionId, userId, page, before,
        reason: 'user_edit', actorType: 'user', promotionStatus: 'promoted',
        summary: `Accepted decision: ${summary}`, session
      });
      const receipt = await persistReceipt({
        NoeisReceipt, userId, session,
        receipt: {
          id: receiptId, kind: 'wiki_decision_accepted', source: 'wiki', sourceLabel: page.title || 'Wiki decision',
          status: 'completed', title: 'Decision accepted',
          summary: 'Human owner accepted a decision against a retained Wiki revision; no external action was executed.',
          touched: [
            { type: 'wiki_page', id: safePageId, title: page.title || 'Wiki page' },
            { type: 'wiki_revision', id: safeAcceptedRevisionId, title: 'Accepted basis revision' },
            { type: 'wiki_revision', id: id(recordedRevisionId), title: 'Decision record revision' }
          ],
          provenance: {
            version: 1, action: 'accept_decision', requestId: safeRequestId, pageId: safePageId, decisionId,
            acceptedRevisionId: safeAcceptedRevisionId, recordedRevisionId: id(recordedRevisionId),
            acceptedRevisionDisposition: disposition,
            acceptedStatus: status,
            immutableSnapshotHash: record.immutableSnapshotHash, basisPageHash: record.basisPageHash,
            relatedClaimIds, sourceRefIds, reviewAt: reviewAt?.toISOString() || null,
            outcomeDueAt: outcomeDueAt?.toISOString() || null
          },
          completedAt: actedAt
        }
      });
      result = { idempotent: false, page, decision: findDecision(page, decisionId), receipt };
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const transitionDecision = async ({
  userId, pageId, decisionId, action, WikiPage, WikiRevision, NoeisReceipt, now = () => new Date()
} = {}) => {
  requireModels({ WikiPage, WikiRevision, NoeisReceipt });
  const safePageId = id(pageId);
  const safeDecisionId = clean(decisionId, 160);
  const safeAction = clean(action, 40).toLowerCase();
  if (!safePageId || !safeDecisionId || !TRANSITIONS[safeAction]) throw new DecisionMutationError('A supported decision transition is required.');
  const receiptId = receiptIdForTransition(safePageId, safeDecisionId, safeAction);
  const session = await WikiPage.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const page = await resolveQuery(queryInSession(WikiPage.findOne({ _id: safePageId, userId, status: { $ne: 'archived' } }), session));
      if (!page) throw new DecisionMutationError('Wiki page not found.', 404, 'not_found');
      const decision = findDecision(page, safeDecisionId);
      if (!decision) throw new DecisionMutationError('Decision not found.', 404, 'not_found');
      assertDecisionIntegrity(decision);
      const targetStatus = safeAction === 'take' ? 'taken' : 'cancelled';
      if (decision.status === targetStatus) {
        const stored = await loadStoredReceipt({ NoeisReceipt, userId, receiptId, session });
        await assertTransitionReplay({
          stored,
          receiptId,
          action: safeAction,
          pageId: safePageId,
          decisionId: safeDecisionId,
          decision,
          WikiRevision,
          userId,
          session
        });
        result = { idempotent: true, page, decision, receipt: serializeStoredReceipt(stored) };
        return;
      }
      if (!TRANSITIONS[safeAction].includes(decision.status)) {
        throw new DecisionMutationError(`Decision cannot transition from ${decision.status} via ${safeAction}.`, 409, 'invalid_transition');
      }
      const actedAt = now();
      const before = snapshotPage(page);
      const revisionId = safeObjectId(WikiRevision);
      decision.status = targetStatus;
      if (safeAction === 'take' && !decision.decidedAt) decision.decidedAt = actedAt;
      page.markModified?.('judgment.decisions');
      await page.save({ session });
      await createWikiRevision({
        WikiRevision, revisionId, userId, page, before, reason: 'user_edit', actorType: 'user', promotionStatus: 'promoted',
        summary: `${safeAction === 'take' ? 'Took' : 'Cancelled'} decision: ${clean(decision.summary, 300)}`, session
      });
      const receipt = await persistReceipt({
        NoeisReceipt, userId, session,
        receipt: {
          id: receiptId, kind: `wiki_decision_${safeAction === 'take' ? 'taken' : 'cancelled'}`, source: 'wiki',
          sourceLabel: page.title || 'Wiki decision', status: 'completed', title: safeAction === 'take' ? 'Decision taken' : 'Decision cancelled',
          summary: safeAction === 'take'
            ? 'Human owner marked the decision taken; no external action was executed by Noeis.'
            : 'Human owner cancelled the decision; no external action was executed by Noeis.',
          touched: [{ type: 'wiki_page', id: safePageId, title: page.title || 'Wiki page' }, { type: 'wiki_revision', id: id(revisionId), title: 'Decision transition revision' }],
          provenance: { version: 1, action: safeAction, pageId: safePageId, decisionId: safeDecisionId, revisionId: id(revisionId), immutableSnapshotHash: decision.immutableSnapshotHash },
          completedAt: actedAt
        }
      });
      result = { idempotent: false, page, decision, receipt };
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const recordDecisionOutcome = async ({
  userId, pageId, decisionId, outcome = {}, WikiPage, WikiRevision, NoeisReceipt,
  Article, NotebookEntry, Question, TagMeta, now = () => new Date()
} = {}) => {
  requireModels({ WikiPage, WikiRevision, NoeisReceipt });
  const safePageId = id(pageId);
  const safeDecisionId = clean(decisionId, 160);
  const actedAt = now();
  const observedAt = dateValue(outcome.observedAt, 'outcome.observedAt', { required: true, now: actedAt });
  if (observedAt > actedAt) throw new DecisionMutationError('outcome.observedAt cannot be in the future.');
  const summary = clean(outcome.summary, 4000);
  const resultValue = clean(outcome.result || 'unknown', 40).toLowerCase();
  const calibrationNote = clean(outcome.calibrationNote, 4000);
  const lesson = clean(outcome.lesson, 4000);
  const expectedDecisionHash = clean(outcome.expectedDecisionHash, 128);
  const processScore = outcome.processScore === undefined || outcome.processScore === null || outcome.processScore === ''
    ? null : Number(outcome.processScore);
  if (!safePageId || !safeDecisionId || !summary || !calibrationNote || !lesson || !expectedDecisionHash) {
    throw new DecisionMutationError('pageId, decisionId, expectedDecisionHash, observation, calibration, and lesson are required.');
  }
  if (!RESULTS.has(resultValue) || resultValue === 'unknown') throw new DecisionMutationError('outcome.result must be positive, negative, or mixed.');
  if (processScore !== null && (!Number.isFinite(processScore) || processScore < 0 || processScore > 1)) {
    throw new DecisionMutationError('outcome.processScore must be between 0 and 1.');
  }
  const evidenceSourceRefIds = unique(outcome.evidenceSourceRefIds);
  if (!evidenceSourceRefIds.length) throw new DecisionMutationError('At least one outcome evidence reference is required.');
  const receiptId = receiptIdForOutcome(safePageId, safeDecisionId);
  const payloadHash = outcomeRecordHash({
    observedAt, summary, result: resultValue, processScore, calibrationNote, lesson, evidenceSourceRefIds
  });
  const session = await WikiPage.db.startSession();
  let response;
  try {
    await session.withTransaction(async () => {
      const page = await resolveQuery(queryInSession(WikiPage.findOne({ _id: safePageId, userId, status: { $ne: 'archived' } }), session));
      if (!page) throw new DecisionMutationError('Wiki page not found.', 404, 'not_found');
      const decision = findDecision(page, safeDecisionId);
      if (!decision) throw new DecisionMutationError('Decision not found.', 404, 'not_found');
      assertDecisionIntegrity(decision);
      if (decision.immutableSnapshotHash !== expectedDecisionHash) {
        throw new DecisionMutationError('Decision changed after this outcome form was opened.', 409, 'stale_decision');
      }
      if (decision.status === 'reviewed') {
        const stored = await loadStoredReceipt({ NoeisReceipt, userId, receiptId, session });
        if (clean(decision?.outcome?.recordHash, 128) !== payloadHash) {
          throw new DecisionMutationError('Decision outcome is already recorded with different evidence.', 409, 'outcome_conflict');
        }
        await assertOutcomeReplay({
          stored,
          receiptId,
          pageId: safePageId,
          decisionId: safeDecisionId,
          decision,
          payloadHash,
          evidenceSourceRefIds,
          WikiRevision,
          userId,
          session
        });
        response = { idempotent: true, page, decision, receipt: serializeStoredReceipt(stored) };
        return;
      }
      if (decision.status !== 'taken') throw new DecisionMutationError('Only a taken decision may receive an outcome.', 409, 'invalid_transition');
      if (decision.decidedAt && observedAt < new Date(decision.decidedAt)) {
        throw new DecisionMutationError('outcome.observedAt cannot precede the decision.', 409, 'observation_precedes_decision');
      }
      assertExactLinks({ page, relatedClaimIds: decision.relatedClaimIds, sourceRefIds: decision.sourceRefIds, evidenceSourceRefIds });
      await assertOwnedEvidence({
        page,
        sourceRefIds: evidenceSourceRefIds,
        userId,
        session,
        models: { WikiPage, Article, NotebookEntry, Question, TagMeta }
      });
      const before = snapshotPage(page);
      const revisionId = safeObjectId(WikiRevision);
      decision.status = 'reviewed';
      decision.outcome = {
        observedAt, summary, result: resultValue, processScore,
        calibrationNote,
        lesson, evidenceSourceRefIds,
        reviewedAt: actedAt, reviewedBy: 'user', revisionId, receiptId,
        decisionSnapshotHash: decision.immutableSnapshotHash,
        recordHash: payloadHash
      };
      page.markModified?.('judgment.decisions');
      await page.save({ session });
      await createWikiRevision({
        WikiRevision, revisionId, userId, page, before, reason: 'user_edit', actorType: 'user', promotionStatus: 'promoted',
        summary: `Recorded outcome: ${clean(decision.summary, 300)}`, session
      });
      const receipt = await persistReceipt({
        NoeisReceipt, userId, session,
        receipt: {
          id: receiptId, kind: 'wiki_decision_outcome_recorded', source: 'wiki', sourceLabel: page.title || 'Wiki decision',
          status: 'completed', title: 'Decision outcome recorded',
          summary: 'Human owner recorded an observed outcome and retained lesson; Noeis did not infer the result.',
          touched: [{ type: 'wiki_page', id: safePageId, title: page.title || 'Wiki page' }, { type: 'wiki_revision', id: id(revisionId), title: 'Outcome revision' }],
          provenance: {
            version: 1, action: 'record_outcome', pageId: safePageId, decisionId: safeDecisionId,
            revisionId: id(revisionId), acceptedRevisionId: id(decision.acceptedRevisionId),
            decisionSnapshotHash: decision.immutableSnapshotHash, payloadHash, evidenceSourceRefIds
          },
          completedAt: actedAt
        }
      });
      response = { idempotent: false, page, decision, receipt };
    });
    return response;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  DecisionMutationError,
  assertNoGenericDecisionMutation,
  createAcceptedDecision,
  immutableDecisionHash,
  immutableDecisionSnapshot,
  outcomeRecordHash,
  outcomeRecordSnapshot,
  recordDecisionOutcome,
  receiptIdForCreate,
  receiptIdForOutcome,
  receiptIdForTransition,
  transitionDecision,
  __testables: {
    assertAcceptedDecisionReplay,
    assertDecisionIntegrity,
    assertExactLinks,
    assertOutcomeReplay,
    assertReceiptEnvelope,
    assertTransitionReplay,
    comparableDecision,
    humanAcceptedRevision
  }
};
