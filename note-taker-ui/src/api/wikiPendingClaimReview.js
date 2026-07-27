import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const HASH_PATTERN = /^[a-f\d]{64}$/i;
const DISPOSITIONS = ['accept', 'reject', 'defer', 'preserve'];

const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const validIso = value => typeof value === 'string'
  && Boolean(value.trim())
  && !Number.isNaN(new Date(value).getTime());

/** Owner-scoped exact investment-dossier claim candidate for review. */
export const getPendingWikiClaimReview = async (wikiPageId) => {
  const safeWikiPageId = text(wikiPageId).toLowerCase();
  if (!OBJECT_ID_PATTERN.test(safeWikiPageId)) {
    throw new Error('Wiki page id must be a valid object id.');
  }
  const res = await api.get(
    `/api/wiki/pages/${safeWikiPageId}/pending-claim-review`,
    getAuthHeaders()
  );
  const data = res?.data;
  if (!plain(data) || !validIso(data.generatedAt)) {
    throw new Error('Pending Wiki claim review response is malformed.');
  }
  if (data.state === 'settled') {
    if (data.claimReview !== null) {
      throw new Error('Settled Wiki claim review response is inconsistent.');
    }
    return data;
  }

  const review = data.claimReview;
  const identity = data.identity;
  const reviewIdentity = review?.identity;
  const identityValid = plain(identity)
    && plain(reviewIdentity)
    && ['conceptId', 'wikiPageId', 'revisionId'].every(key => (
      OBJECT_ID_PATTERN.test(text(identity[key]))
      && text(identity[key]).toLowerCase() === text(reviewIdentity[key]).toLowerCase()
    ))
    && text(identity.wikiPageId).toLowerCase() === safeWikiPageId
    && Boolean(text(identity.claimId))
    && text(identity.claimId).length <= 240
    && text(identity.claimId) === text(reviewIdentity.claimId);
  const claimValid = claim => plain(claim)
    && text(claim.claimId) === text(identity?.claimId)
    && Boolean(text(claim.text));
  const diffValid = plain(review?.diff)
    && Array.isArray(review.diff.segments)
    && review.diff.segments.every(segment => plain(segment)
      && ['equal', 'added', 'removed'].includes(segment.kind)
      && typeof segment.text === 'string')
    && Array.isArray(review.diff.changedFields)
    && review.diff.changedFields.every(field => Boolean(text(field)))
    && typeof review.diff.boundedExplanation === 'string';
  const evidenceValid = plain(review?.evidenceDelta)
    && ['added', 'removed', 'supporting', 'contradicting']
      .every(key => Array.isArray(review.evidenceDelta[key]));
  const affectedValid = plain(review?.affected)
    && Array.isArray(review.affected.pages)
    && Array.isArray(review.affected.concepts)
    && review.affected.pages.some(ref => text(ref?.id).toLowerCase() === safeWikiPageId)
    && review.affected.concepts.some(ref => (
      text(ref?.id).toLowerCase() === text(identity?.conceptId).toLowerCase()
    ));
  const state = text(data.state).toLowerCase();
  const stateValid = ['pending', 'deferred'].includes(state)
    && review?.state === state
    && review?.canAct === true
    && review?.unavailableReason === ''
    && Array.isArray(review?.allowedDispositions)
    && JSON.stringify(review.allowedDispositions) === JSON.stringify(DISPOSITIONS);
  const receiptValid = state === 'pending'
    ? review?.receipt == null && review?.deferredUntil == null
    : plain(review?.receipt)
      && Boolean(text(review.receipt.id))
      && review.receipt.kind === 'wiki_claim_disposition'
      && review.receipt.status === 'completed'
      && validIso(review.receipt.completedAt)
      && validIso(review.deferredUntil);

  if (!identityValid
    || !plain(review)
    || review.version !== 1
    || !stateValid
    || !claimValid(review.current)
    || !claimValid(review.proposed)
    || !diffValid
    || !evidenceValid
    || !affectedValid
    || !Array.isArray(review.unresolved)
    || !HASH_PATTERN.test(text(review.candidateHash))
    || !HASH_PATTERN.test(text(review.currentClaimHash))
    || !receiptValid) {
    throw new Error('Pending Wiki claim review response is malformed or mismatched.');
  }
  return data;
};

export default getPendingWikiClaimReview;
