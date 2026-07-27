import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { disposeWikiClaimRevision } from './wikiClaimDisposition';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const REVIEW_STATES = new Set(['pending', 'deferred', 'accepted', 'preserved']);
const DISPOSITIONS = new Set(['accept', 'reject', 'defer', 'preserve']);
const REVIEWABLE_STATES = new Set(['pending', 'deferred']);
const COUNTERS = ['pending', 'deferred', 'accepted', 'preserved', 'rejected'];

const fail = (message) => {
  throw new Error(`Invalid repository claim cohort contract: ${message}`);
};
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const objectId = (value, label) => {
  const normalized = text(value);
  if (!OBJECT_ID_PATTERN.test(normalized)) fail(`${label} must be a valid object id.`);
  return normalized.toLowerCase();
};
const uniqueStrings = (value) => (
  Array.isArray(value)
  && value.length > 0
  && value.every(item => Boolean(text(item)))
  && new Set(value.map(item => text(item))).size === value.length
);
const validIso = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  return !Number.isNaN(new Date(value).getTime());
};

const validateCandidateReceipt = (candidate) => {
  if (candidate.state === 'pending') return candidate.receipt === null;
  return plain(candidate.receipt)
    && Boolean(text(candidate.receipt.id))
    && candidate.receipt.kind === 'wiki_claim_disposition'
    && validIso(candidate.receipt.completedAt);
};

const validateQueue = (data, requestedPageId) => {
  if (!plain(data)
    || data.version !== 1
    || !plain(data.page)
    || objectId(data.page.id, 'response page.id') !== requestedPageId
    || !plain(data.page.repository)
    || !text(data.page.repository.owner)
    || !text(data.page.repository.repo)
    || data.page.repository.fullName !== `${data.page.repository.owner}/${data.page.repository.repo}`
    || !plain(data.cohort)
    || !text(data.cohort.id)
    || !OBJECT_ID_PATTERN.test(text(data.cohort.sourceEventId))
    || !OBJECT_ID_PATTERN.test(text(data.cohort.maintenanceRunId))
    || !text(data.cohort.baseHeadSha)
    || !text(data.cohort.candidateHeadSha)
    || !text(data.cohort.snapshotKey)
    || !Number.isInteger(data.cohort.expectedCount)
    || data.cohort.expectedCount < 1
    || !uniqueStrings(data.cohort.expectedClaimIds)
    || data.cohort.expectedClaimIds.length !== data.cohort.expectedCount
    || !plain(data.cohort.integrity)
    || data.cohort.integrity.ok !== true
    || typeof data.cohort.integrity.code !== 'string'
    || !plain(data.cohort.publishability)
    || typeof data.cohort.publishability.ok !== 'boolean'
    || typeof data.cohort.publishability.code !== 'string'
    || !Array.isArray(data.cohort.publishability.reasons)
    || !data.cohort.publishability.reasons.every(reason => Boolean(text(reason)))
    || typeof data.cohort.publishability.newerHeadQueued !== 'boolean'
    || !plain(data.cohort.progress)
    || data.humanActionRequired !== true
    || !Array.isArray(data.candidates)
    || data.candidates.length !== data.cohort.expectedCount) {
    fail('queue envelope is incomplete or inconsistent.');
  }

  const progress = data.cohort.progress;
  if (!Number.isInteger(progress.total)
    || progress.total !== data.cohort.expectedCount
    || COUNTERS.some(key => !Number.isInteger(progress[key]) || progress[key] < 0)
    || COUNTERS.reduce((sum, key) => sum + progress[key], 0) !== progress.total) {
    fail('progress does not reconcile to the cohort manifest.');
  }

  const candidateClaimIds = [];
  const revisionIds = new Set();
  data.candidates.forEach((candidate) => {
    if (!plain(candidate)) fail('candidate is malformed.');
    const revisionId = objectId(candidate.revisionId, 'candidate revisionId');
    const claimId = text(candidate.claimId);
    const allowed = candidate.allowedDispositions;
    if (revisionIds.has(revisionId)
      || !claimId
      || !REVIEW_STATES.has(candidate.state)
      || !Array.isArray(allowed)
      || new Set(allowed).size !== allowed.length
      || !allowed.every(action => DISPOSITIONS.has(action))
      || (!REVIEWABLE_STATES.has(candidate.state) && allowed.length !== 0)
      || !validateCandidateReceipt(candidate)) {
      fail('candidate identity, state, dispositions, or receipt is invalid.');
    }
    const expectedAllowed = data.cohort.publishability.ok
      ? ['accept', 'preserve', 'reject', 'defer']
      : ['reject', 'defer'];
    if (REVIEWABLE_STATES.has(candidate.state)
      && (allowed.length !== expectedAllowed.length || allowed.some((action, index) => action !== expectedAllowed[index]))) {
      fail('candidate dispositions disagree with cohort publishability.');
    }
    revisionIds.add(revisionId);
    candidateClaimIds.push(claimId);
  });

  const expectedClaimIds = data.cohort.expectedClaimIds.map(item => text(item));
  if (candidateClaimIds.length !== new Set(candidateClaimIds).size
    || JSON.stringify(candidateClaimIds) !== JSON.stringify(expectedClaimIds)) {
    fail('candidate claims do not exactly match the cohort manifest.');
  }
  return data;
};

/** Load the exact repository claim cohort awaiting owner review. */
export const getWikiRepoClaimCandidates = async (pageId) => {
  const safePageId = objectId(pageId, 'pageId');
  const res = await api.get(
    `/api/wiki/pages/${safePageId}/repo-claim-candidates`,
    getAuthHeaders()
  );
  return validateQueue(res?.data, safePageId);
};

/** Record a human disposition using the shared receipt-bound write contract. */
export const disposeWikiRepoClaimCandidate = async (revisionId, payload = {}) => (
  disposeWikiClaimRevision(revisionId, payload)
);

const wikiRepoClaimCandidatesApi = {
  getWikiRepoClaimCandidates,
  disposeWikiRepoClaimCandidate
};

export default wikiRepoClaimCandidatesApi;
