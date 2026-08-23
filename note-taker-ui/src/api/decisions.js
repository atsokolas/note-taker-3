import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { notifyNoeisLoopStatusChanged } from '../system/noeisLoopEvents';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const HASH_PATTERN = /^[a-f\d]{64}$/i;
const DECISION_FILTERS = new Set(['all', 'upcoming_review', 'awaiting_outcome', 'reviewed']);
const DECISION_TYPES = new Set([
  'research', 'outreach', 'product', 'operating', 'investment', 'no_action', 'close'
]);
const DECISION_STATUSES = new Set(['planned', 'taken', 'cancelled', 'reviewed']);
const CREATE_STATUSES = new Set(['planned', 'taken']);
const TRANSITION_ACTIONS = new Set(['take', 'cancel']);
const OUTCOME_RESULTS = new Set(['positive', 'negative', 'mixed']);
const CREATE_KEYS = new Set([
  'summary', 'rationale', 'expectedOutcome', 'decisionType', 'status', 'horizon',
  'successCriteria', 'reviewAt', 'outcomeDueAt', 'relatedClaimIds', 'sourceRefIds'
]);
const OUTCOME_KEYS = new Set([
  'expectedDecisionHash', 'observedAt', 'summary', 'result', 'processScore',
  'calibrationNote', 'lesson', 'evidenceSourceRefIds'
]);

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const requireObjectId = (value, label) => {
  const safe = String(value || '').trim();
  if (!OBJECT_ID_PATTERN.test(safe)) throw new Error(`${label} must be a valid object id.`);
  return safe;
};
const requireOpaque = (value, label, max = 160) => {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  const safe = value.trim();
  if (!safe || safe.length > max) throw new Error(`${label} must contain 1 to ${max} characters.`);
  return safe;
};
const requireIso = (value, label) => {
  const safe = requireOpaque(value, label, 80);
  const parsed = new Date(safe);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== safe) {
    throw new Error(`${label} must be an ISO-8601 timestamp.`);
  }
  return safe;
};
const requireStringList = (value, label, { required = false } = {}) => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const normalized = value.map(item => requireOpaque(item, `${label} item`, 240));
  if (required && normalized.length === 0) throw new Error(`${label} must not be empty.`);
  return normalized;
};
const rejectUnknownKeys = (value, allowed, label) => {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} contains unsupported fields: ${unknown.join(', ')}.`);
};

const queryStringFor = ({
  filter = 'upcoming_review',
  limit = 25,
  windowDays = 30,
  pageId = '',
  cursor = ''
} = {}) => {
  const safeFilter = String(filter || '').trim().toLowerCase();
  if (!DECISION_FILTERS.has(safeFilter)) throw new Error('Decision filter is unsupported.');
  const safeLimit = Number(limit);
  if (!Number.isInteger(safeLimit) || safeLimit < 1 || safeLimit > 100) {
    throw new Error('Decision limit must be an integer from 1 to 100.');
  }
  const safeWindowDays = Number(windowDays);
  if (!Number.isInteger(safeWindowDays) || safeWindowDays < 1 || safeWindowDays > 365) {
    throw new Error('Decision window must be an integer from 1 to 365 days.');
  }
  const safePageId = pageId === '' || pageId === undefined || pageId === null
    ? ''
    : requireObjectId(pageId, 'Decision page id');
  const cursorProvided = cursor !== '' && cursor !== undefined && cursor !== null;
  const safeCursor = cursorProvided ? requireOpaque(cursor, 'Decision cursor', 4000) : '';
  const query = new URLSearchParams({
    filter: safeFilter,
    limit: String(safeLimit),
    windowDays: String(safeWindowDays)
  });
  if (safePageId) query.set('pageId', safePageId);
  if (safeCursor) query.set('cursor', safeCursor);
  return {
    suffix: `?${query.toString()}`,
    expected: { filter: safeFilter, limit: safeLimit, windowDays: safeWindowDays, pageId: safePageId }
  };
};

const requireDecisionIndex = (data, expected) => {
  const filtersValid = isPlainObject(data?.filters)
    && data.filters.filter === expected.filter
    && data.filters.windowDays === expected.windowDays
    && data.filters.pageId === (expected.pageId || null)
    && typeof data.filters.asOf === 'string'
    && data.filters.asOf === data.generatedAt;
  const itemsValid = Array.isArray(data?.items) && data.items.every(item => (
    isPlainObject(item)
    && item.version === 1
    && typeof item.id === 'string'
    && item.id.trim()
    && isPlainObject(item.identity)
    && OBJECT_ID_PATTERN.test(String(item.identity.pageId || '').trim())
    && (!expected.pageId
      || String(item.identity.pageId).trim().toLowerCase() === expected.pageId.toLowerCase())
    && typeof item.identity.decisionId === 'string'
    && item.identity.decisionId.trim()
  ));
  if (
    !isPlainObject(data)
    || data.version !== 1
    || !itemsValid
    || !(data.nextCursor === null || typeof data.nextCursor === 'string')
    || !filtersValid
    || !isPlainObject(data.counts)
    || !isPlainObject(data.coverage)
    || typeof data.generatedAt !== 'string'
    || !data.generatedAt.trim()
  ) {
    throw new Error('Decisions response is malformed.');
  }
  return data;
};

const requireReceipt = (receipt, { kind, action, pageId, decisionId, acceptedRevisionId, requestId }) => {
  const provenance = receipt?.provenance;
  if (
    !isPlainObject(receipt)
    || typeof receipt.id !== 'string'
    || !receipt.id.trim()
    || receipt.kind !== kind
    || receipt.source !== 'wiki'
    || receipt.status !== 'completed'
    || typeof receipt.completedAt !== 'string'
    || Number.isNaN(new Date(receipt.completedAt).getTime())
    || !isPlainObject(provenance)
    || provenance.version !== 1
    || provenance.action !== action
    || provenance.pageId !== pageId
    || provenance.decisionId !== decisionId
    || (acceptedRevisionId && provenance.acceptedRevisionId !== acceptedRevisionId)
    || (requestId && provenance.requestId !== requestId)
  ) {
    throw new Error('Decision receipt is malformed or mismatched.');
  }
};

const requireMutationResponse = (data, {
  pageId,
  decisionId = '',
  acceptedRevisionId = '',
  requestId = '',
  status,
  kind,
  action
}) => {
  const returnedDecisionId = String(data?.decisionId || '').trim();
  if (
    !isPlainObject(data)
    || typeof data.idempotent !== 'boolean'
    || data.pageId !== pageId
    || !returnedDecisionId
    || (decisionId && returnedDecisionId !== decisionId)
    || data.status !== status
    || !DECISION_STATUSES.has(data.status)
    || !OBJECT_ID_PATTERN.test(String(data.acceptedRevisionId || '').trim())
    || (acceptedRevisionId && data.acceptedRevisionId !== acceptedRevisionId)
    || !HASH_PATTERN.test(String(data.immutableSnapshotHash || '').trim())
  ) {
    throw new Error('Decision mutation response is malformed or mismatched.');
  }
  requireReceipt(data.receipt, {
    kind,
    action,
    pageId,
    decisionId: returnedDecisionId,
    acceptedRevisionId,
    requestId
  });
  return data;
};

export const getDecisions = async (params = {}) => {
  const { suffix, expected } = queryStringFor(params);
  const response = await api.get(`/api/decisions${suffix}`, getAuthHeaders());
  return requireDecisionIndex(response.data, expected);
};

export const createWikiDecision = async (pageId, {
  acceptedRevisionId,
  requestId,
  decision = {}
} = {}) => {
  const safePageId = requireObjectId(pageId, 'Decision page id');
  const safeRevisionId = requireObjectId(acceptedRevisionId, 'Accepted revision id');
  const safeRequestId = requireOpaque(requestId, 'Decision request id');
  if (!isPlainObject(decision)) throw new Error('Decision must be an object.');
  rejectUnknownKeys(decision, CREATE_KEYS, 'Decision');
  const decisionType = String(decision.decisionType || 'research').trim().toLowerCase();
  const status = String(decision.status || 'planned').trim().toLowerCase();
  if (!DECISION_TYPES.has(decisionType)) throw new Error('Decision type is unsupported.');
  if (!CREATE_STATUSES.has(status)) throw new Error('Decision status must be planned or taken.');
  const bodyDecision = {
    summary: requireOpaque(decision.summary, 'Decision summary', 2000),
    rationale: requireOpaque(decision.rationale, 'Decision rationale', 4000),
    expectedOutcome: requireOpaque(decision.expectedOutcome, 'Decision expected outcome', 4000),
    decisionType,
    status,
    reviewAt: requireIso(decision.reviewAt, 'Decision review date'),
    relatedClaimIds: requireStringList(decision.relatedClaimIds, 'Related claim ids', { required: true }),
    sourceRefIds: requireStringList(decision.sourceRefIds, 'Source reference ids', { required: true })
  };
  if (decision.horizon !== undefined) bodyDecision.horizon = requireOpaque(decision.horizon, 'Decision horizon', 500);
  if (decision.successCriteria !== undefined) {
    bodyDecision.successCriteria = requireStringList(decision.successCriteria, 'Success criteria');
  }
  if (decision.outcomeDueAt) bodyDecision.outcomeDueAt = requireIso(decision.outcomeDueAt, 'Outcome due date');
  const response = await api.post(
    `/api/wiki/pages/${safePageId}/decisions`,
    { acceptedRevisionId: safeRevisionId, requestId: safeRequestId, decision: bodyDecision },
    getAuthHeaders()
  );
  const mutation = requireMutationResponse(response.data, {
    pageId: safePageId,
    acceptedRevisionId: safeRevisionId,
    requestId: safeRequestId,
    status,
    kind: 'wiki_decision_accepted',
    action: 'accept_decision'
  });
  notifyNoeisLoopStatusChanged('loop.outcome-review');
  return mutation;
};

export const transitionWikiDecision = async (pageId, decisionId, { action } = {}) => {
  const safePageId = requireObjectId(pageId, 'Decision page id');
  const safeDecisionId = requireOpaque(decisionId, 'Decision id');
  const safeAction = String(action || '').trim().toLowerCase();
  if (!TRANSITION_ACTIONS.has(safeAction)) throw new Error('Decision action must be take or cancel.');
  const response = await api.post(
    `/api/wiki/pages/${safePageId}/decisions/${encodeURIComponent(safeDecisionId)}/transition`,
    { action: safeAction },
    getAuthHeaders()
  );
  const result = requireMutationResponse(response.data, {
    pageId: safePageId,
    decisionId: safeDecisionId,
    status: safeAction === 'take' ? 'taken' : 'cancelled',
    kind: `wiki_decision_${safeAction === 'take' ? 'taken' : 'cancelled'}`,
    action: safeAction
  });
  notifyNoeisLoopStatusChanged('loop.outcome-review');
  return result;
};

export const recordWikiDecisionOutcome = async (pageId, decisionId, { outcome = {} } = {}) => {
  const safePageId = requireObjectId(pageId, 'Decision page id');
  const safeDecisionId = requireOpaque(decisionId, 'Decision id');
  if (!isPlainObject(outcome)) throw new Error('Decision outcome must be an object.');
  rejectUnknownKeys(outcome, OUTCOME_KEYS, 'Decision outcome');
  const expectedDecisionHash = String(outcome.expectedDecisionHash || '').trim();
  if (!HASH_PATTERN.test(expectedDecisionHash)) throw new Error('Expected decision hash must be a SHA-256 hash.');
  const result = String(outcome.result || '').trim().toLowerCase();
  if (!OUTCOME_RESULTS.has(result)) throw new Error('Outcome result must be positive, negative, or mixed.');
  const processScore = outcome.processScore === null ? null : Number(outcome.processScore);
  if (processScore !== null && (!Number.isFinite(processScore) || processScore < 0 || processScore > 1)) {
    throw new Error('Outcome process score must be between 0 and 1.');
  }
  const bodyOutcome = {
    expectedDecisionHash,
    observedAt: requireIso(outcome.observedAt, 'Outcome observation date'),
    summary: requireOpaque(outcome.summary, 'Outcome summary', 4000),
    result,
    processScore,
    calibrationNote: requireOpaque(outcome.calibrationNote, 'Outcome calibration note', 4000),
    lesson: requireOpaque(outcome.lesson, 'Outcome lesson', 4000),
    evidenceSourceRefIds: requireStringList(
      outcome.evidenceSourceRefIds,
      'Outcome evidence source ids',
      { required: true }
    )
  };
  const response = await api.post(
    `/api/wiki/pages/${safePageId}/decisions/${encodeURIComponent(safeDecisionId)}/outcome`,
    { outcome: bodyOutcome },
    getAuthHeaders()
  );
  const mutation = requireMutationResponse(response.data, {
    pageId: safePageId,
    decisionId: safeDecisionId,
    status: 'reviewed',
    kind: 'wiki_decision_outcome_recorded',
    action: 'record_outcome'
  });
  notifyNoeisLoopStatusChanged('loop.outcome-review');
  return mutation;
};

const decisionsApi = {
  getDecisions,
  createWikiDecision,
  transitionWikiDecision,
  recordWikiDecisionOutcome
};

export default decisionsApi;
