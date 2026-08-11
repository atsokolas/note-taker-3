/**
 * Extract human-accepted / preserved revision identity for decision creation.
 *
 * Never soft-infers from updatedAt, initialRevisionId, or "latest" revision.
 * Only uses structural disposition fields already present on responses.
 */

const clean = (value) => String(value || '').trim();
const OBJECT_ID = /^[a-f\d]{24}$/i;

const hasDispositionEvent = (revision, action) => {
  const events = Array.isArray(revision?.claimReview?.events) ? revision.claimReview.events : [];
  return events.some(event => (
    clean(event?.action).toLowerCase() === action
    && clean(event?.receiptId)
  ));
};

/**
 * True when a WikiRevision list/detail row is structurally an accepted or preserved
 * claim disposition basis (matches backend humanAcceptedRevision shape, without
 * inventing missing fields).
 */
export const isStructurallyAcceptedRevision = (revision) => {
  if (!revision || typeof revision !== 'object') return false;
  const revisionId = clean(revision._id || revision.id);
  if (!OBJECT_ID.test(revisionId)) return false;
  if (revision.snapshotPrunedAt != null) return false;

  const disposition = clean(revision?.claimReview?.state).toLowerCase();
  if (disposition === 'accepted') {
    return revision.promotionStatus === 'promoted'
      && Boolean(revision.after)
      && hasDispositionEvent(revision, 'accept');
  }
  if (disposition === 'preserved') {
    return revision.promotionStatus === 'preserved'
      && Boolean(revision.before)
      && hasDispositionEvent(revision, 'preserve');
  }
  return false;
};

/**
 * From claimReview envelope (investigation / Stage 4 disposition reload).
 * Returns revisionId only when state is accepted or preserved.
 */
export const acceptedRevisionIdFromClaimReview = (claimReview) => {
  const state = clean(claimReview?.state).toLowerCase();
  if (state !== 'accepted' && state !== 'preserved') return '';
  const revisionId = clean(claimReview?.identity?.revisionId);
  return OBJECT_ID.test(revisionId) ? revisionId : '';
};

/**
 * Filter a revisions list response down to selectable accepted/preserved bases.
 */
export const selectableAcceptedRevisions = (revisions = []) => (
  (Array.isArray(revisions) ? revisions : [])
    .filter(isStructurallyAcceptedRevision)
    .map(revision => {
      const revisionId = clean(revision._id || revision.id);
      const disposition = clean(revision?.claimReview?.state).toLowerCase();
      const claimId = clean(revision?.claimReview?.targetClaimId || revision?.claimId);
      const summary = clean(revision?.summary)
        || clean(revision?.after?.claims?.find?.(c => clean(c?.claimId) === claimId)?.text)
        || clean(revision?.before?.claims?.find?.(c => clean(c?.claimId) === claimId)?.text)
        || `Revision ${revisionId.slice(-6)}`;
      return {
        revisionId,
        disposition,
        claimId,
        summary: summary.slice(0, 240),
        reviewedAt: revision?.claimReview?.reviewedAt || revision?.createdAt || null
      };
    })
);

const acceptedRevisionIdentity = {
  isStructurallyAcceptedRevision,
  acceptedRevisionIdFromClaimReview,
  selectableAcceptedRevisions
};

export default acceptedRevisionIdentity;
