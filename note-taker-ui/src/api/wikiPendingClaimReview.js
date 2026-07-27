import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const HASH_PATTERN = /^[a-f\d]{64}$/i;
const DISPOSITIONS = ['accept', 'reject', 'defer', 'preserve'];
const KNOWLEDGE_REF_TYPES = new Set([
  'article', 'highlight', 'note', 'question', 'concept', 'wiki_page',
  'wiki_claim', 'wiki_revision', 'decision', 'external'
]);

const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const validIso = value => typeof value === 'string'
  && Boolean(value.trim())
  && !Number.isNaN(new Date(value).getTime());
const safeHref = value => {
  const href = text(value);
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  try {
    const parsed = new URL(href);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch (_error) {
    return false;
  }
};
const validKnowledgeRef = ref => plain(ref)
  && KNOWLEDGE_REF_TYPES.has(text(ref.type))
  && OBJECT_ID_PATTERN.test(text(ref.id))
  && (ref.parentId === undefined || ref.parentId === null || OBJECT_ID_PATTERN.test(text(ref.parentId)))
  && Boolean(text(ref.title))
  && safeHref(ref.href);

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
      .every(key => Array.isArray(review.evidenceDelta[key])
        && review.evidenceDelta[key].every(validKnowledgeRef));
  const affectedValid = plain(review?.affected)
    && Array.isArray(review.affected.pages)
    && Array.isArray(review.affected.concepts)
    && review.affected.pages.length === 1
    && review.affected.concepts.length === 1
    && validKnowledgeRef(review.affected.pages[0])
    && validKnowledgeRef(review.affected.concepts[0])
    && text(review.affected.pages[0].type) === 'wiki_page'
    && text(review.affected.pages[0].id).toLowerCase() === safeWikiPageId
    && text(review.affected.concepts[0].type) === 'concept'
    && text(review.affected.concepts[0].id).toLowerCase() === text(identity?.conceptId).toLowerCase();
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
      && text(review.receipt.id) === `wiki-claim-disposition:v1:${text(identity?.revisionId).toLowerCase()}:defer`
      && review.receipt.kind === 'wiki_claim_disposition'
      && review.receipt.status === 'completed'
      && validIso(review.receipt.completedAt)
      && validIso(review.deferredUntil)
      && plain(review.receipt.provenance)
      && review.receipt.provenance.version === 1
      && text(review.receipt.provenance.action) === 'defer'
      && text(review.receipt.provenance.pageId).toLowerCase() === safeWikiPageId
      && text(review.receipt.provenance.conceptId).toLowerCase() === text(identity?.conceptId).toLowerCase()
      && text(review.receipt.provenance.revisionId).toLowerCase() === text(identity?.revisionId).toLowerCase()
      && text(review.receipt.provenance.claimId) === text(identity?.claimId);

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
