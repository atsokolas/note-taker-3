import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const ACTION_STATES = Object.freeze({
  accept: 'accepted',
  reject: 'rejected',
  defer: 'deferred',
  preserve: 'preserved'
});

const fail = (message) => {
  throw new Error(`Invalid Wiki claim disposition contract: ${message}`);
};

const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const objectId = (value, label) => {
  const normalized = text(value);
  if (!OBJECT_ID_PATTERN.test(normalized)) fail(`${label} must be a valid object id.`);
  return normalized.toLowerCase();
};
const iso = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const validateReceipt = ({ receipt, action, revisionId, pageId, deferredUntil }) => {
  if (!plain(receipt)
    || !text(receipt.id)
    || receipt.kind !== 'wiki_claim_disposition'
    || receipt.source !== 'wiki'
    || receipt.status !== 'completed'
    || !iso(receipt.completedAt)
    || !plain(receipt.provenance)
    || Number(receipt.provenance.version) !== 1
    || receipt.provenance.action !== action
    || text(receipt.provenance.revisionId).toLowerCase() !== revisionId
    || text(receipt.provenance.pageId).toLowerCase() !== pageId
    || !text(receipt.provenance.claimId)) {
    fail('receipt is missing or disagrees with the requested revision.');
  }
  const receiptDeferredUntil = receipt.provenance.deferredUntil == null
    ? null
    : iso(receipt.provenance.deferredUntil);
  if (action === 'defer') {
    if (!receiptDeferredUntil || receiptDeferredUntil !== deferredUntil) {
      fail('receipt deferredUntil disagrees with the request.');
    }
  } else if (receipt.provenance.deferredUntil != null) {
    fail('non-defer receipt must not include deferredUntil.');
  }
};

const validateCohort = (cohort, pageId) => {
  if (cohort === null) return;
  if (!plain(cohort)
    || typeof cohort.finalized !== 'boolean'
    || typeof cohort.blocked !== 'string'
    || !(cohort.receipt === null || plain(cohort.receipt))) {
    fail('cohort settlement is malformed.');
  }
  if (cohort.finalized && (cohort.blocked || !cohort.receipt)) {
    fail('finalized cohort is missing its durable receipt.');
  }
  if (cohort.receipt) {
    const receipt = cohort.receipt;
    if (!text(receipt.id)
      || receipt.kind !== 'repo_wiki_claim_cohort_accepted'
      || receipt.source !== 'wiki'
      || receipt.status !== 'completed'
      || !iso(receipt.completedAt)
      || !plain(receipt.provenance)
      || Number(receipt.provenance.version) !== 1
      || text(receipt.provenance.pageId).toLowerCase() !== pageId) {
      fail('cohort receipt is malformed or bound to another page.');
    }
  }
};

const validateResponse = ({ data, action, revisionId, deferredUntil }) => {
  if (!plain(data)
    || typeof data.idempotent !== 'boolean'
    || data.state !== ACTION_STATES[action]
    || text(data.revisionId).toLowerCase() !== revisionId) {
    fail('response does not match the requested action and revision.');
  }
  const pageId = objectId(data.pageId, 'response pageId');
  validateReceipt({ receipt: data.receipt, action, revisionId, pageId, deferredUntil });
  validateCohort(data.cohort, pageId);
  return data;
};

/**
 * Record a human disposition on a claim-scoped Wiki revision candidate.
 * @param {string} revisionId
 * @param {{ action: 'accept'|'reject'|'defer'|'preserve', note?: string, deferredUntil?: string }} payload
 */
export const disposeWikiClaimRevision = async (revisionId, payload = {}) => {
  const safeRevisionId = objectId(revisionId, 'revisionId');
  if (!plain(payload)) fail('payload must be an object.');
  const action = text(payload.action).toLowerCase();
  if (!Object.hasOwn(ACTION_STATES, action)) fail('action is unsupported.');

  const body = { action };
  if (payload.note !== undefined && payload.note !== null) {
    if (typeof payload.note !== 'string' || payload.note.trim().length > 2000) {
      fail('note must be a string no longer than 2000 characters.');
    }
    if (payload.note.trim()) body.note = payload.note.trim();
  }

  let deferredUntil = null;
  if (action === 'defer') {
    deferredUntil = iso(payload.deferredUntil);
    if (!deferredUntil || new Date(deferredUntil).getTime() <= Date.now()) {
      fail('deferredUntil must be a future ISO timestamp when deferring.');
    }
    body.deferredUntil = deferredUntil;
  } else if (payload.deferredUntil !== undefined && payload.deferredUntil !== null) {
    fail('deferredUntil is only valid for defer.');
  }

  const res = await api.post(
    `/api/wiki/revisions/${safeRevisionId}/disposition`,
    body,
    getAuthHeaders()
  );
  return validateResponse({
    data: res?.data,
    action,
    revisionId: safeRevisionId,
    deferredUntil
  });
};

const wikiClaimDispositionApi = {
  disposeWikiClaimRevision
};

export default wikiClaimDispositionApi;
