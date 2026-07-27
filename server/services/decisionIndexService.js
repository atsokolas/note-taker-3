const { isWikiPageSurfaceEligible } = require('./wikiPageQualityGuard');
const { snapshotContentHash } = require('./wikiRevisionService');
const {
  immutableDecisionHash,
  outcomeRecordHash,
  receiptIdForTransition
} = require('./decisionMutationService');
const { assertClaimDispositionReplayReceipt } = require('./wikiClaimDispositionService');

const DECISION_FILTERS = Object.freeze(['all', 'upcoming_review', 'awaiting_outcome', 'reviewed']);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;
const PAGE_SCAN_LIMIT = 250;

class DecisionIndexError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'DecisionIndexError';
    this.status = status;
    this.code = code;
  }
}

const id = value => String(value?._id || value?.id || value || '').trim();
const list = value => Array.isArray(value) ? value : [];
const uniqueIds = values => Array.from(new Set(list(values).map(id).filter(Boolean)));
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const clean = (value = '', limit = 4000) => String(value || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);
const iso = value => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const inSession = (query, session) => session && query?.session ? query.session(session) : query;
const awaitQuery = async query => await (query?.lean ? query.lean() : query);
const visible = value => Boolean(value && value.archived !== true && value.hiddenFromHome !== true && value.debugOnly !== true);
const owned = (value, userId) => id(value?.userId) === id(userId);
const claimBasisComparable = claim => ({
  claimId: clean(claim?.claimId, 160),
  text: clean(claim?.text, 8000),
  section: clean(claim?.section, 500),
  support: clean(claim?.support, 40),
  citationIds: uniqueIds(claim?.citationIds),
  sourceRefIds: uniqueIds(claim?.sourceRefIds),
  contradictedByCitationIds: uniqueIds(claim?.contradictedByCitationIds),
  confidence: claim?.confidence ?? null,
  epistemicStatus: clean(claim?.epistemicStatus, 80),
  materiality: clean(claim?.materiality, 80)
});
const sourceBasisComparable = source => ({
  id: id(source),
  type: clean(source?.type, 80),
  objectId: id(source?.objectId),
  parentObjectId: id(source?.parentObjectId),
  url: clean(source?.url, 2000)
});
const exactSingleBy = (rows, key) => {
  const found = list(rows).filter(row => key(row));
  return found.length === 1 ? found[0] : null;
};
const sameIdSet = (left, right) => JSON.stringify(uniqueIds(left).sort())
  === JSON.stringify(uniqueIds(right).sort());
const safeHash = (hashFn, value) => {
  try { return hashFn(value); } catch (_error) { return ''; }
};
const timeMs = value => {
  const normalized = iso(value);
  return normalized ? new Date(normalized).getTime() : null;
};
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
const receiptIdOf = receipt => clean(receipt?.receiptId || receipt?.id, 300);
const receiptHasTouch = (receipt, type, objectId) => list(receipt?.touched).some(item => (
  clean(item?.type, 80) === type && id(item?.id) === id(objectId)
));
const receiptEnvelopeValid = ({ receipt, receiptId, kind, action, pageId, decisionId }) => {
  const raw = plain(receipt);
  const provenance = plain(raw?.provenance) || {};
  return Boolean(
    raw
    && receiptIdOf(raw) === receiptId
    && clean(raw.kind, 100) === kind
    && clean(raw.source, 40) === 'wiki'
    && clean(raw.status, 40) === 'completed'
    && iso(raw.completedAt)
    && Number(provenance.version) === 1
    && clean(provenance.action, 80) === action
    && id(provenance.pageId) === id(pageId)
    && clean(provenance.decisionId, 160) === clean(decisionId, 160)
    && receiptHasTouch(raw, 'wiki_page', pageId)
  );
};

const encodeCursor = payload => Buffer.from(JSON.stringify(payload)).toString('base64url');
const decodeCursor = value => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (parsed?.version !== 1 || !Array.isArray(parsed.tuple) || parsed.tuple.length !== 4
      || typeof parsed.tuple[0] !== 'number' || !Number.isFinite(parsed.tuple[0])
      || typeof parsed.tuple[1] !== 'number' || !Number.isFinite(parsed.tuple[1])
      || parsed.tuple.slice(2).some(part => typeof part !== 'string')
      || !DECISION_FILTERS.includes(parsed.filter) || !iso(parsed.asOf)) throw new Error('invalid cursor');
    return parsed;
  } catch (_error) {
    throw new DecisionIndexError('cursor is invalid.', 400, 'invalid_cursor');
  }
};

const pageRef = page => ({
  type: 'wiki_page', id: id(page), title: clean(page?.title || 'Untitled Wiki page', 180),
  href: `/wiki/workspace?page=${encodeURIComponent(id(page))}`
});
const decisionRef = (page, decision) => ({
  type: 'decision', id: clean(decision?.decisionId, 160), parentId: id(page),
  title: clean(decision?.summary || 'Untitled decision', 240),
  href: `/wiki/workspace?page=${encodeURIComponent(id(page))}&decisionId=${encodeURIComponent(decision?.decisionId || '')}`
});
const claimRef = (page, claim) => ({
  type: 'wiki_claim', id: clean(claim?.claimId, 160), parentId: id(page),
  title: clean(claim?.text || 'Untitled claim', 300),
  href: `/wiki/workspace?page=${encodeURIComponent(id(page))}&claimId=${encodeURIComponent(claim?.claimId || '')}`
});

const validProcessScore = value => value === null || value === undefined
  || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const validOutcomeResult = value => !value || ['positive', 'negative', 'mixed', 'unknown'].includes(clean(value, 40));
const hasSubstantiveOutcome = (decision, asOf = null) => Boolean(
  iso(decision?.outcome?.observedAt)
    && (!asOf || new Date(decision.outcome.observedAt) <= new Date(asOf))
  || clean(decision?.outcome?.summary)
  || clean(decision?.outcome?.calibrationNote)
  || clean(decision?.outcome?.lesson)
  || decision?.outcome?.processScore !== null && decision?.outcome?.processScore !== undefined
    && validProcessScore(decision.outcome.processScore)
);
const dueState = ({ decision, asOf }) => {
  if (decision?.status === 'reviewed' || decision?.status === 'cancelled') return 'none';
  const reviewAt = iso(decision?.reviewAt);
  if (!reviewAt) return 'unscheduled';
  return new Date(reviewAt) <= asOf ? 'overdue' : 'upcoming';
};
const decisionMatchesFilter = ({ decision, filter, asOf, windowDays }) => {
  if (!decision || decision.status === 'cancelled') return false;
  if (filter === 'all') return true;
  if (filter === 'upcoming_review') {
    const reviewAt = iso(decision.reviewAt);
    if (!['planned', 'taken'].includes(decision.status) || !reviewAt) return false;
    const windowEnd = new Date(asOf.getTime() + windowDays * 86400000);
    return new Date(reviewAt) <= windowEnd;
  }
  if (filter === 'awaiting_outcome') return decision.status === 'taken' && !hasSubstantiveOutcome(decision, asOf);
  if (filter === 'reviewed') return decision.status === 'reviewed';
  return false;
};

const tupleFor = ({ page, decision, filter, asOf }) => {
  if (filter === 'all') return [0, 0, id(page), clean(decision.decisionId, 160)];
  const state = dueState({ decision, asOf });
  const rank = { overdue: 0, upcoming: 1, unscheduled: 2, none: 3 }[state] ?? 4;
  const fallback = filter === 'reviewed' ? 0 : 8640000000000000;
  const timeValue = filter === 'reviewed'
    ? decision?.outcome?.observedAt || decision?.decidedAt || decision?.createdAt
    : decision?.reviewAt || decision?.createdAt;
  const parsedTime = iso(timeValue);
  const rawTime = parsedTime ? new Date(parsedTime).getTime() : fallback;
  return [rank, filter === 'reviewed' ? -rawTime : rawTime, id(page), clean(decision.decisionId, 160)];
};
const compareTuple = (left, right) => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
};

const collectSourceKeys = pages => {
  const keys = [];
  list(pages).forEach(page => {
    const sourceById = new Map(list(page?.sourceRefs).map(ref => [id(ref), ref]));
    list(page?.judgment?.decisions).forEach(decision => [
      ...list(decision?.sourceRefIds),
      ...list(decision?.outcome?.evidenceSourceRefIds)
    ].forEach(sourceRefId => {
      const ref = sourceById.get(id(sourceRefId));
      const type = clean(ref?.type, 40).toLowerCase();
      const objectId = id(ref?.objectId);
      if (objectId && ['article', 'highlight', 'notebook', 'note', 'question', 'concept'].includes(type)) keys.push({ type, objectId });
    }));
  });
  return Array.from(new Map(keys.map(key => [`${key.type}:${key.objectId}`, key])).values());
};

const loadContinuityResolver = async ({ pages, userId, models, asOf = new Date(), session = null }) => {
  const revisionIds = uniqueIds(pages.flatMap(page => list(page?.judgment?.decisions).flatMap(decision => [
    decision?.acceptedRevisionId,
    decision?.recordedRevisionId,
    decision?.outcome?.revisionId
  ])));
  const decisionReceiptIds = Array.from(new Set(pages.flatMap(page => list(page?.judgment?.decisions).flatMap(decision => [
    clean(decision?.receiptId, 300),
    clean(decision?.outcome?.receiptId, 300),
    clean(decision?.decisionId, 160)
      ? receiptIdForTransition(id(page), clean(decision.decisionId, 160), 'take')
      : ''
  ])).filter(Boolean)));
  const revisionQuery = revisionIds.length && models.WikiRevision?.find
    ? models.WikiRevision.find({ userId, _id: { $in: revisionIds } })
    : [];
  const revisionRows = await awaitQuery(inSession(revisionQuery, session));
  const revisions = new Map(list(revisionRows).map(plain).filter(value => owned(value, userId)).map(value => [id(value), value]));
  const dispositionReceiptIds = list(revisionRows).flatMap(revision => list(revision?.claimReview?.events)
    .map(event => clean(event?.receiptId, 300))).filter(Boolean);
  const receiptIds = Array.from(new Set([...decisionReceiptIds, ...dispositionReceiptIds]));
  const receiptQuery = receiptIds.length && models.NoeisReceipt?.find
    ? models.NoeisReceipt.find({ userId, receiptId: { $in: receiptIds } })
    : [];
  const receiptRows = await awaitQuery(inSession(receiptQuery, session));
  const receipts = new Map(list(receiptRows).map(plain).filter(value => owned(value, userId)).map(value => [clean(value.receiptId, 300), value]));
  const transitionRevisionIds = uniqueIds(decisionReceiptIds.map(receiptId => (
    receipts.get(receiptId)?.provenance?.revisionId
  ))).filter(revisionId => !revisions.has(revisionId));
  if (transitionRevisionIds.length && models.WikiRevision?.find) {
    const transitionRevisionRows = await awaitQuery(inSession(models.WikiRevision.find({
      userId,
      _id: { $in: transitionRevisionIds }
    }), session));
    list(transitionRevisionRows).map(plain).filter(value => owned(value, userId)).forEach(value => {
      revisions.set(id(value), value);
    });
  }
  return (page, decision) => {
    const missing = [];
    const acceptedRevisionId = id(decision?.acceptedRevisionId);
    const recordedRevisionId = id(decision?.recordedRevisionId);
    const accepted = revisions.get(acceptedRevisionId);
    const recorded = revisions.get(recordedRevisionId);
    const decisionId = clean(decision?.decisionId, 160);
    const disposition = clean(decision?.acceptedRevisionDisposition, 40);
    const acceptedBasis = disposition === 'preserved' ? accepted?.before : accepted?.after;
    const dispositionAction = disposition === 'accepted' ? 'accept' : disposition === 'preserved' ? 'preserve' : '';
    const dispositionEvent = [...list(accepted?.claimReview?.events)].reverse()
      .find(event => clean(event?.action, 40) === dispositionAction);
    const dispositionReceipt = receipts.get(clean(dispositionEvent?.receiptId, 300));
    const dispositionCompletedMs = timeMs(dispositionReceipt?.completedAt);
    let dispositionProofValid = false;
    if (accepted && dispositionReceipt && dispositionAction) {
      try {
        assertClaimDispositionReplayReceipt({
          storedReceipt: dispositionReceipt,
          revision: accepted,
          action: dispositionAction,
          page
        });
        dispositionProofValid = true;
      } catch (_error) {
        dispositionProofValid = false;
      }
    }
    const acceptedValid = Boolean(
      acceptedRevisionId
      && accepted
      && id(accepted.pageId) === id(page)
      && accepted.snapshotPrunedAt == null
      && acceptedBasis
      && ['accepted', 'preserved'].includes(disposition)
      && clean(accepted?.claimReview?.state, 40) === disposition
      && accepted.promotionStatus === (disposition === 'preserved' ? 'preserved' : 'promoted')
      && dispositionProofValid
      && clean(decision?.basisPageHash, 128) === safeHash(snapshotContentHash, acceptedBasis)
    );
    if (!acceptedRevisionId) missing.push('accepted_revision_id');
    else if (!acceptedValid) missing.push('accepted_revision_integrity');
    if (acceptedValid) {
      const linkDrift = uniqueIds(decision?.relatedClaimIds).some(claimId => {
        const basisClaim = exactSingleBy(acceptedBasis?.claims, claim => clean(claim?.claimId, 160) === claimId);
        const currentClaim = exactSingleBy(page?.claims, claim => clean(claim?.claimId, 160) === claimId);
        return !basisClaim || !currentClaim
          || JSON.stringify(claimBasisComparable(basisClaim)) !== JSON.stringify(claimBasisComparable(currentClaim));
      }) || uniqueIds(decision?.sourceRefIds).some(sourceRefId => {
        const basisSource = exactSingleBy(acceptedBasis?.sourceRefs, source => id(source) === sourceRefId);
        const currentSource = exactSingleBy(page?.sourceRefs, source => id(source) === sourceRefId);
        return !basisSource || !currentSource
          || JSON.stringify(sourceBasisComparable(basisSource)) !== JSON.stringify(sourceBasisComparable(currentSource));
      });
      if (linkDrift) missing.push('accepted_basis_link_drift');
    }
    const immutableHash = clean(decision?.immutableSnapshotHash, 128);
    const receiptId = clean(decision?.receiptId, 300);
    const receipt = receipts.get(receiptId);
    const receiptProvenance = plain(receipt?.provenance) || {};
    const receiptCompletedAt = iso(receipt?.completedAt);
    const receiptCompletedMs = timeMs(receiptCompletedAt);
    const asOfMs = timeMs(asOf);
    const acceptedStatus = clean(receiptProvenance.acceptedStatus, 40);
    const recordedDecision = recorded?.after
      ? exactSingleBy(recorded.after?.judgment?.decisions, candidate => (
        clean(candidate?.decisionId, 160) === decisionId
      ))
      : null;
    const recordedValid = Boolean(
      recordedRevisionId && recorded && id(recorded.pageId) === id(page)
      && recorded.actorType === 'user' && recorded.promotionStatus === 'promoted'
      && recorded.snapshotPrunedAt == null && recorded.after
      && recordedDecision
      && id(recordedDecision?.recordedRevisionId) === recordedRevisionId
      && clean(recordedDecision?.immutableSnapshotHash, 128) === immutableHash
      && safeHash(immutableDecisionHash, recordedDecision) === immutableHash
      && sameAcceptedDecisionProvenance(recordedDecision, decision)
    );
    if (!recordedValid) {
      missing.push('recorded_revision_integrity');
    }
    if (!immutableHash || safeHash(immutableDecisionHash, decision) !== immutableHash) missing.push('decision_snapshot_integrity');
    if (decision?.createdBy !== 'user' || decision?.acceptedBy !== 'user') missing.push('decision_actor_integrity');
    const decisionReceiptValid = Boolean(
      receiptEnvelopeValid({
        receipt,
        receiptId,
        kind: 'wiki_decision_accepted',
        action: 'accept_decision',
        pageId: id(page),
        decisionId
      })
      && clean(receiptProvenance.requestId, 160)
      && id(receiptProvenance.acceptedRevisionId) === acceptedRevisionId
      && id(receiptProvenance.recordedRevisionId) === recordedRevisionId
      && clean(receiptProvenance.acceptedRevisionDisposition, 40) === disposition
      && ['planned', 'taken'].includes(acceptedStatus)
      && clean(receiptProvenance.immutableSnapshotHash, 128) === immutableHash
      && clean(receiptProvenance.basisPageHash, 128) === clean(decision?.basisPageHash, 128)
      && sameIdSet(receiptProvenance.relatedClaimIds, decision?.relatedClaimIds)
      && sameIdSet(receiptProvenance.sourceRefIds, decision?.sourceRefIds)
      && iso(receiptProvenance.reviewAt) === iso(recordedDecision?.reviewAt)
      && iso(receiptProvenance.outcomeDueAt) === iso(recordedDecision?.outcomeDueAt)
      && receiptHasTouch(receipt, 'wiki_revision', acceptedRevisionId)
      && receiptHasTouch(receipt, 'wiki_revision', recordedRevisionId)
      && clean(recordedDecision?.status, 40) === acceptedStatus
      && clean(recordedDecision?.receiptId, 300) === receiptId
      && clean(recordedDecision?.acceptedBy, 40) === 'user'
      && clean(recordedDecision?.createdBy, 40) === 'user'
      && iso(recordedDecision?.acceptedAt) === receiptCompletedAt
      && iso(recordedDecision?.createdAt) === receiptCompletedAt
      && receiptCompletedMs !== null
      && asOfMs !== null
      && dispositionCompletedMs !== null
      && dispositionCompletedMs <= receiptCompletedMs
      && timeMs(recordedDecision?.reviewAt) > receiptCompletedMs
      && (timeMs(recordedDecision?.outcomeDueAt) === null
        || timeMs(recordedDecision?.outcomeDueAt) > receiptCompletedMs)
      && receiptCompletedMs <= asOfMs
      && (acceptedStatus === 'taken'
        ? iso(recordedDecision?.decidedAt) === receiptCompletedAt
        : iso(recordedDecision?.decidedAt) === null)
    );
    if (!decisionReceiptValid) {
      missing.push('decision_receipt_integrity');
    }

    const currentStatus = clean(decision?.status, 40);
    let lifecycleComplete = false;
    if (recordedValid && decisionReceiptValid && currentStatus === 'planned') {
      lifecycleComplete = acceptedStatus === 'planned' && iso(decision?.decidedAt) === null;
    } else if (recordedValid && decisionReceiptValid && ['taken', 'reviewed'].includes(currentStatus)) {
      if (acceptedStatus === 'taken') {
        lifecycleComplete = iso(decision?.decidedAt) === receiptCompletedAt
          && timeMs(decision?.decidedAt) >= receiptCompletedMs;
      } else if (acceptedStatus === 'planned') {
        const transitionReceiptId = receiptIdForTransition(id(page), decisionId, 'take');
        const transitionReceipt = receipts.get(transitionReceiptId);
        const transitionProvenance = plain(transitionReceipt?.provenance) || {};
        const transitionRevisionId = id(transitionProvenance.revisionId);
        const transitionRevision = revisions.get(transitionRevisionId);
        const beforeTransition = transitionRevision?.before
          ? exactSingleBy(transitionRevision.before?.judgment?.decisions, candidate => clean(candidate?.decisionId, 160) === decisionId)
          : null;
        const afterTransition = transitionRevision?.after
          ? exactSingleBy(transitionRevision.after?.judgment?.decisions, candidate => clean(candidate?.decisionId, 160) === decisionId)
          : null;
        const transitionCompletedAt = iso(transitionReceipt?.completedAt);
        const transitionCompletedMs = timeMs(transitionCompletedAt);
        lifecycleComplete = Boolean(
          receiptEnvelopeValid({
            receipt: transitionReceipt,
            receiptId: transitionReceiptId,
            kind: 'wiki_decision_taken',
            action: 'take',
            pageId: id(page),
            decisionId
          })
          && clean(transitionProvenance.immutableSnapshotHash, 128) === immutableHash
          && transitionRevisionId
          && receiptHasTouch(transitionReceipt, 'wiki_revision', transitionRevisionId)
          && transitionRevision
          && id(transitionRevision.pageId) === id(page)
          && transitionRevision.actorType === 'user'
          && transitionRevision.promotionStatus === 'promoted'
          && transitionRevision.snapshotPrunedAt == null
          && beforeTransition?.status === 'planned'
          && afterTransition?.status === 'taken'
          && safeHash(immutableDecisionHash, beforeTransition) === immutableHash
          && safeHash(immutableDecisionHash, afterTransition) === immutableHash
          && sameAcceptedDecisionProvenance(beforeTransition, decision)
          && sameAcceptedDecisionProvenance(afterTransition, decision)
          && iso(beforeTransition?.decidedAt) === null
          && iso(afterTransition?.decidedAt) === transitionCompletedAt
          && iso(decision?.decidedAt) === transitionCompletedAt
          && transitionCompletedMs !== null
          && transitionCompletedMs >= receiptCompletedMs
          && transitionCompletedMs <= asOfMs
        );
      }
    }
    if (!lifecycleComplete) missing.push('decision_transition_integrity');

    let outcomeComplete = decision.status !== 'reviewed';
    if (decision.status === 'reviewed') {
      const outcomeRevisionId = id(decision?.outcome?.revisionId);
      const outcomeRevision = revisions.get(outcomeRevisionId);
      const outcomeReceipt = receipts.get(clean(decision?.outcome?.receiptId, 300));
      const outcomeHash = clean(decision?.outcome?.recordHash, 128);
      const recomputedOutcomeHash = safeHash(outcomeRecordHash, decision?.outcome || {});
      const observedAt = iso(decision?.outcome?.observedAt);
      const reviewedAt = iso(decision?.outcome?.reviewedAt);
      const decidedMs = timeMs(decision?.decidedAt);
      const observedMs = timeMs(observedAt);
      const reviewedMs = timeMs(reviewedAt);
      const beforeOutcomeDecision = outcomeRevision?.before
        ? exactSingleBy(outcomeRevision.before?.judgment?.decisions, candidate => clean(candidate?.decisionId, 160) === decisionId)
        : null;
      const revisionDecision = outcomeRevision?.after
        ? exactSingleBy(outcomeRevision.after?.judgment?.decisions, candidate => (
          clean(candidate?.decisionId, 160) === decisionId
        ))
        : null;
      const revisionOutcomeHash = revisionDecision
        ? safeHash(outcomeRecordHash, revisionDecision?.outcome || {})
        : '';
      const revisionSnapshotValid = Boolean(
        beforeOutcomeDecision && revisionDecision
        && beforeOutcomeDecision.status === 'taken'
        && revisionDecision.status === 'reviewed'
        && sameAcceptedDecisionProvenance(beforeOutcomeDecision, decision)
        && sameAcceptedDecisionProvenance(revisionDecision, decision)
        && iso(beforeOutcomeDecision?.decidedAt) === iso(decision?.decidedAt)
        && clean(revisionDecision?.immutableSnapshotHash, 128) === immutableHash
        && safeHash(immutableDecisionHash, beforeOutcomeDecision) === immutableHash
        && safeHash(immutableDecisionHash, revisionDecision) === immutableHash
        && id(revisionDecision?.outcome?.revisionId) === outcomeRevisionId
        && clean(revisionDecision?.outcome?.receiptId, 300) === clean(decision?.outcome?.receiptId, 300)
        && revisionDecision?.outcome?.reviewedBy === 'user'
        && iso(revisionDecision?.outcome?.reviewedAt) === reviewedAt
        && clean(revisionDecision?.outcome?.decisionSnapshotHash, 128) === immutableHash
        && clean(revisionDecision?.outcome?.recordHash, 128) === outcomeHash
        && revisionOutcomeHash === outcomeHash
      );
      outcomeComplete = Boolean(
        outcomeRevisionId && outcomeRevision && id(outcomeRevision.pageId) === id(page)
        && outcomeRevision.actorType === 'user'
        && outcomeRevision.promotionStatus === 'promoted'
        && outcomeRevision.snapshotPrunedAt == null && outcomeRevision.after
        && revisionSnapshotValid
        && lifecycleComplete
        && decision?.outcome?.reviewedBy === 'user'
        && reviewedAt && new Date(reviewedAt) <= new Date(asOf)
        && decidedMs !== null && observedMs !== null && reviewedMs !== null
        && receiptCompletedMs <= decidedMs
        && decidedMs <= observedMs
        && observedMs <= reviewedMs
        && reviewedMs <= asOfMs
        && receiptEnvelopeValid({
          receipt: outcomeReceipt,
          receiptId: clean(decision?.outcome?.receiptId, 300),
          kind: 'wiki_decision_outcome_recorded',
          action: 'record_outcome',
          pageId: id(page),
          decisionId
        })
        && iso(outcomeReceipt?.completedAt) === reviewedAt
        && id(outcomeReceipt?.provenance?.revisionId) === outcomeRevisionId
        && id(outcomeReceipt?.provenance?.acceptedRevisionId) === acceptedRevisionId
        && clean(outcomeReceipt?.provenance?.decisionSnapshotHash, 128) === immutableHash
        && clean(outcomeReceipt?.provenance?.payloadHash, 128) === outcomeHash
        && sameIdSet(outcomeReceipt?.provenance?.evidenceSourceRefIds, decision?.outcome?.evidenceSourceRefIds)
        && receiptHasTouch(outcomeReceipt, 'wiki_revision', outcomeRevisionId)
        && recomputedOutcomeHash === outcomeHash
      );
      if (!outcomeComplete) missing.push('outcome_receipt_integrity');
    }
    return {
      acceptedRevisionId: acceptedRevisionId || null,
      acceptedRevisionDisposition: disposition || null,
      recordedRevisionId: recordedRevisionId || null,
      outcomeRevisionId: id(decision?.outcome?.revisionId) || null,
      outcomeReceiptId: clean(decision?.outcome?.receiptId, 300) || null,
      decisionReceiptId: clean(decision?.receiptId, 300) || null,
      immutableSnapshotHash: immutableHash || null,
      outcomeRecordHash: decision.status === 'reviewed'
        ? clean(decision?.outcome?.recordHash, 128) || null
        : null,
      complete: missing.length === 0 && outcomeComplete,
      missing
    };
  };
};

const loadEvidenceResolver = async ({ pages, userId, models, session = null }) => {
  const keys = collectSourceKeys(pages);
  const idsFor = types => keys.filter(key => types.includes(key.type)).map(key => key.objectId);
  const articleIds = idsFor(['article']);
  const highlightIds = idsFor(['highlight']);
  const noteIds = idsFor(['notebook', 'note']);
  const questionIds = idsFor(['question']);
  const conceptIds = idsFor(['concept']);
  const visibleQuery = { userId, hiddenFromHome: { $ne: true }, debugOnly: { $ne: true }, archived: { $ne: true } };
  const articleQuery = articleIds.length || highlightIds.length ? models.Article?.find?.({
    ...visibleQuery,
    $or: [
      ...(articleIds.length ? [{ _id: { $in: articleIds } }] : []),
      ...(highlightIds.length ? [{ 'highlights._id': { $in: highlightIds } }] : [])
    ]
  }) : [];
  const noteQuery = noteIds.length ? models.NotebookEntry?.find?.({ ...visibleQuery, _id: { $in: noteIds } }) : [];
  const questionQuery = questionIds.length ? models.Question?.find?.({ ...visibleQuery, _id: { $in: questionIds } }) : [];
  const conceptQuery = conceptIds.length ? models.TagMeta?.find?.({ ...visibleQuery, _id: { $in: conceptIds } }) : [];
  const [articlesRaw, notesRaw, questionsRaw, conceptsRaw] = await Promise.all([
    awaitQuery(inSession(articleQuery || [], session)),
    awaitQuery(inSession(noteQuery || [], session)),
    awaitQuery(inSession(questionQuery || [], session)),
    awaitQuery(inSession(conceptQuery || [], session))
  ]);
  const articles = list(articlesRaw).map(plain).filter(value => owned(value, userId) && visible(value));
  const notes = new Map(list(notesRaw).map(plain).filter(value => owned(value, userId) && visible(value)).map(value => [id(value), value]));
  const questions = new Map(list(questionsRaw).map(plain).filter(value => owned(value, userId) && visible(value)).map(value => [id(value), value]));
  const concepts = new Map(list(conceptsRaw).map(plain).filter(value => owned(value, userId) && visible(value)).map(value => [id(value), value]));
  const articleById = new Map(articles.map(value => [id(value), value]));
  const highlightById = new Map();
  articles.forEach(article => list(article.highlights).forEach(highlight => highlightById.set(id(highlight), { article, highlight })));
  return ref => {
    const type = clean(ref?.type, 40).toLowerCase();
    const objectId = id(ref?.objectId);
    if (type === 'article') {
      const article = articleById.get(objectId);
      return article ? { type: 'article', id: objectId, title: clean(article.title || 'Untitled source', 220), href: `/library?articleId=${encodeURIComponent(objectId)}` } : null;
    }
    if (type === 'highlight') {
      const found = highlightById.get(objectId);
      return found ? { type: 'highlight', id: objectId, parentId: id(found.article), title: clean(found.highlight?.text || 'Source highlight', 220), href: `/library?articleId=${encodeURIComponent(id(found.article))}&highlightId=${encodeURIComponent(objectId)}` } : null;
    }
    if (type === 'notebook' || type === 'note') {
      const note = notes.get(objectId);
      return note ? { type: 'note', id: objectId, title: clean(note.title || note.content || 'Untitled note', 220), href: `/think?tab=notebook&entryId=${encodeURIComponent(objectId)}` } : null;
    }
    if (type === 'question') {
      const question = questions.get(objectId);
      return question ? { type: 'question', id: objectId, title: clean(question.text || 'Untitled question', 220), href: `/think?tab=questions&questionId=${encodeURIComponent(objectId)}` } : null;
    }
    if (type === 'concept') {
      const concept = concepts.get(objectId);
      return concept ? { type: 'concept', id: objectId, title: clean(concept.name || 'Untitled concept', 220), href: `/think?tab=concepts&concept=${encodeURIComponent(concept.name || objectId)}&conceptId=${encodeURIComponent(objectId)}` } : null;
    }
    return null;
  };
};

const serializeDecision = ({ page, decision, evidenceResolver, continuityResolver, asOf }) => {
  const claimRows = list(page.claims).filter(claim => clean(claim?.claimId, 160));
  const sourceRows = list(page.sourceRefs).filter(ref => id(ref));
  const claimCounts = new Map();
  const sourceCounts = new Map();
  claimRows.forEach(claim => claimCounts.set(clean(claim.claimId, 160), (claimCounts.get(clean(claim.claimId, 160)) || 0) + 1));
  sourceRows.forEach(ref => sourceCounts.set(id(ref), (sourceCounts.get(id(ref)) || 0) + 1));
  const ambiguousClaimIds = new Set([...claimCounts].filter(([, count]) => count > 1).map(([value]) => value));
  const ambiguousSourceRefIds = new Set([...sourceCounts].filter(([, count]) => count > 1).map(([value]) => value));
  const claimById = new Map(claimRows.filter(claim => !ambiguousClaimIds.has(clean(claim.claimId, 160))).map(claim => [clean(claim.claimId, 160), claim]));
  const sourceById = new Map(sourceRows.filter(ref => !ambiguousSourceRefIds.has(id(ref))).map(ref => [id(ref), ref]));
  const requestedClaimIds = Array.from(new Set(list(decision.relatedClaimIds).map(value => clean(value, 160)).filter(Boolean)));
  const requestedSourceRefIds = Array.from(new Set(list(decision.sourceRefIds).map(id).filter(Boolean)));
  const requestedOutcomeSourceRefIds = Array.from(new Set(list(decision?.outcome?.evidenceSourceRefIds).map(id).filter(Boolean)));
  const missingClaimIds = requestedClaimIds.filter(value => !claimById.has(value) && !ambiguousClaimIds.has(value));
  const missingSourceRefIds = requestedSourceRefIds.filter(sourceRefId => {
    const ref = sourceById.get(sourceRefId);
    return !ambiguousSourceRefIds.has(sourceRefId) && (!ref || !evidenceResolver(ref));
  });
  const relatedClaims = requestedClaimIds.filter(value => !ambiguousClaimIds.has(value)).map(value => claimById.get(value)).filter(Boolean).map(claim => claimRef(page, claim));
  const evidence = requestedSourceRefIds
    .filter(value => !ambiguousSourceRefIds.has(value))
    .map(sourceRefId => {
      const resolved = evidenceResolver(sourceById.get(sourceRefId));
      return resolved ? { ...resolved, sourceRefId } : null;
    })
    .filter(Boolean);
  const outcomeEvidence = requestedOutcomeSourceRefIds
    .filter(value => !ambiguousSourceRefIds.has(value))
    .map(sourceRefId => {
      const resolved = evidenceResolver(sourceById.get(sourceRefId));
      return resolved ? { ...resolved, sourceRefId } : null;
    })
    .filter(Boolean);
  const missingOutcomeSourceRefIds = requestedOutcomeSourceRefIds.filter(sourceRefId => {
    const ref = sourceById.get(sourceRefId);
    return ambiguousSourceRefIds.has(sourceRefId) || !ref || !evidenceResolver(ref);
  });
  const observedAt = iso(decision?.outcome?.observedAt);
  const observationOccurred = Boolean(observedAt && new Date(observedAt) <= asOf);
  const substantiveOutcome = hasSubstantiveOutcome(decision, asOf);
  const outcomeIntegrity = validProcessScore(decision?.outcome?.processScore)
    && validOutcomeResult(decision?.outcome?.result)
    && (!decision?.outcome?.observedAt || observationOccurred);
  const continuity = continuityResolver
    ? continuityResolver(page, decision)
    : { acceptedRevisionId: null, complete: false, missing: ['accepted_revision_id'] };
  const missing = [...list(continuity.missing)];
  if (missingClaimIds.length) missing.push('related_claims');
  if (missingSourceRefIds.length) missing.push('source_references');
  if (requestedClaimIds.some(value => ambiguousClaimIds.has(value))) missing.push('ambiguous_claim_ids');
  if (requestedSourceRefIds.some(value => ambiguousSourceRefIds.has(value))) missing.push('ambiguous_source_ref_ids');
  if (!outcomeIntegrity) missing.push('outcome_integrity');
  if (missingOutcomeSourceRefIds.length) missing.push('outcome_source_references');
  const completeContinuity = continuity.complete && missing.length === 0;
  const verifiedObserved = decision.status === 'reviewed' && observationOccurred && completeContinuity;
  return {
    version: 1,
    id: `decision:${id(page)}:${clean(decision.decisionId, 160)}`,
    identity: { decisionId: clean(decision.decisionId, 160), pageId: id(page) },
    subject: decisionRef(page, decision),
    page: pageRef(page),
    decision: {
      summary: clean(decision.summary, 2000), rationale: clean(decision.rationale, 4000),
      decisionType: clean(decision.decisionType, 80), expectedOutcome: clean(decision.expectedOutcome, 4000),
      horizon: clean(decision.horizon, 500), successCriteria: list(decision.successCriteria).map(value => clean(value, 500)).filter(Boolean),
      status: clean(decision.status, 40), origin: decision.createdBy === 'ai_proposed' ? 'ai_proposed' : 'user',
      outcomeDueAt: iso(decision.outcomeDueAt),
      decidedAt: iso(decision.decidedAt), reviewAt: iso(decision.reviewAt), createdAt: iso(decision.createdAt)
    },
    dueState: dueState({ decision, asOf }),
    currentWikiContext: {
      governingQuestion: clean(page?.judgment?.governingQuestion, 2000),
      currentJudgment: clean(page?.judgment?.currentJudgment, 8000),
      status: clean(page?.judgment?.status, 80), decisionPosture: clean(page?.judgment?.decisionPosture, 80),
      lastReviewedAt: iso(page?.judgment?.lastReviewedAt), acceptanceState: 'unverified'
    },
    links: {
      claims: { resolved: relatedClaims, missingIds: missingClaimIds },
      sources: {
        resolved: Array.from(new Map(evidence.map(ref => [ref.sourceRefId, ref])).values()),
        missingIds: missingSourceRefIds
      }
    },
    outcome: {
      state: verifiedObserved
        ? 'observed'
        : decision.status === 'reviewed'
          ? 'review_incomplete'
          : substantiveOutcome
            ? 'unverified'
            : 'awaiting_observation',
      observedAt: verifiedObserved ? observedAt : null,
      summary: substantiveOutcome ? clean(decision?.outcome?.summary, 4000) : '',
      result: substantiveOutcome && validOutcomeResult(decision?.outcome?.result) ? clean(decision?.outcome?.result, 40) || 'unknown' : 'unknown',
      processScore: substantiveOutcome && validProcessScore(decision?.outcome?.processScore)
        && decision?.outcome?.processScore !== null && decision?.outcome?.processScore !== undefined
        ? Number(decision.outcome.processScore) : null,
      calibrationNote: substantiveOutcome ? clean(decision?.outcome?.calibrationNote, 4000) : '',
      lesson: substantiveOutcome ? clean(decision?.outcome?.lesson, 4000) : '',
      evidence: Array.from(new Map(outcomeEvidence.map(ref => [ref.sourceRefId, ref])).values()),
      missingEvidenceIds: missingOutcomeSourceRefIds,
      reviewedAt: iso(decision?.outcome?.reviewedAt),
      receiptId: clean(decision?.outcome?.receiptId, 300) || null
    },
    continuity: { ...continuity, complete: completeContinuity, missing: Array.from(new Set(missing)) }
  };
};

const buildDecisionIndex = async ({
  userId, filter = 'upcoming_review', windowDays = DEFAULT_WINDOW_DAYS, limit = DEFAULT_LIMIT,
  cursor = '', pageId = '', asOf = new Date(), models = {}, session = null
} = {}) => {
  if (!userId) throw new DecisionIndexError('buildDecisionIndex requires a userId.');
  if (!DECISION_FILTERS.includes(filter)) throw new DecisionIndexError('Unsupported decision filter.');
  const safeWindowDays = Math.max(1, Math.min(Number(windowDays) || DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS));
  const safeLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT));
  const cursorPayload = decodeCursor(cursor);
  if (cursorPayload && (
    cursorPayload.filter !== filter
    || cursorPayload.windowDays !== safeWindowDays
    || String(cursorPayload.pageId || '') !== String(pageId || '')
  )) throw new DecisionIndexError('cursor does not match the active filters.', 400, 'cursor_mismatch');
  const asOfDate = new Date(cursorPayload?.asOf || asOf);
  if (Number.isNaN(asOfDate.getTime())) throw new DecisionIndexError('asOf must be a valid date.');
  const cursorTuple = cursorPayload?.tuple || null;
  if (!models.WikiPage?.find) return { items: [], nextCursor: null, asOf: asOfDate.toISOString(), counts: Object.fromEntries(DECISION_FILTERS.map(value => [value, 0])), coverage: { scannedPages: 0, pageLimit: PAGE_SCAN_LIMIT, truncated: false, invalidDecisions: 0, proposalsExcluded: 0 } };
  const pageQuery = {
    userId, 'judgment.decisions.0': { $exists: true }, status: { $ne: 'archived' },
    archived: { $ne: true }, hiddenFromHome: { $ne: true }, debugOnly: { $ne: true },
    ...(pageId ? { _id: pageId } : {})
  };
  let query = models.WikiPage.find(pageQuery);
  query = query.select?.('_id userId title status archived hiddenFromHome debugOnly plainText aiState judgment claims sourceRefs') || query;
  query = query.sort?.({ _id: 1 }) || query;
  query = query.limit?.(PAGE_SCAN_LIMIT + 1) || query;
  query = inSession(query, session);
  const pageRows = list(await awaitQuery(query)).map(plain);
  const truncated = pageRows.length > PAGE_SCAN_LIMIT;
  const pages = pageRows.slice(0, PAGE_SCAN_LIMIT).filter(page => owned(page, userId) && visible(page) && page.status !== 'archived' && isWikiPageSurfaceEligible(page));
  const evidenceResolver = await loadEvidenceResolver({ pages, userId, models, session });
  const continuityResolver = await loadContinuityResolver({ pages, userId, models, asOf: asOfDate, session });
  const counts = Object.fromEntries(DECISION_FILTERS.map(value => [value, 0]));
  let invalidDecisions = 0;
  let proposalsExcluded = 0;
  const rows = [];
  pages.forEach(page => {
    const decisions = list(page?.judgment?.decisions).map(plain);
    const decisionIds = decisions.map(decision => clean(decision?.decisionId, 160));
    const duplicates = new Set(decisionIds.filter((value, index) => value && decisionIds.indexOf(value) !== index));
    decisions.forEach(decision => {
      const decisionId = clean(decision?.decisionId, 160);
      if (!decisionId || duplicates.has(decisionId) || !clean(decision.summary, 2000) || !['planned', 'taken', 'cancelled', 'reviewed'].includes(decision.status)) {
        invalidDecisions += 1;
        return;
      }
      if (decision.createdBy === 'ai_proposed' && decision.status === 'planned') {
        proposalsExcluded += 1;
        return;
      }
      DECISION_FILTERS.forEach(value => {
        if (decisionMatchesFilter({ decision, filter: value, asOf: asOfDate, windowDays: safeWindowDays })) counts[value] += 1;
      });
      if (!decisionMatchesFilter({ decision, filter, asOf: asOfDate, windowDays: safeWindowDays })) return;
      const tuple = tupleFor({ page, decision, filter, asOf: asOfDate });
      if (cursorTuple && compareTuple(tuple, cursorTuple) <= 0) return;
      rows.push({ tuple, item: serializeDecision({ page, decision, evidenceResolver, continuityResolver, asOf: asOfDate }) });
    });
  });
  rows.sort((left, right) => compareTuple(left.tuple, right.tuple));
  const selected = rows.slice(0, safeLimit);
  return {
    items: selected.map(row => row.item),
    nextCursor: rows.length > safeLimit ? encodeCursor({
      version: 1,
      filter,
      windowDays: safeWindowDays,
      pageId: pageId || '',
      asOf: asOfDate.toISOString(),
      tuple: selected.at(-1).tuple
    }) : null,
    asOf: asOfDate.toISOString(),
    counts,
    coverage: { scannedPages: pages.length, pageLimit: PAGE_SCAN_LIMIT, truncated, invalidDecisions, proposalsExcluded }
  };
};

module.exports = {
  DECISION_FILTERS, DEFAULT_LIMIT, MAX_LIMIT, DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS, PAGE_SCAN_LIMIT,
  DecisionIndexError, buildDecisionIndex, decisionMatchesFilter, hasSubstantiveOutcome, serializeDecision,
  __testables: { clean, compareTuple, decodeCursor, dueState, encodeCursor, loadContinuityResolver, loadEvidenceResolver, tupleFor }
};
