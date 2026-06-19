export const BLOCKED_SURFACE_EXPLANATION = (
  'Hidden from Explore, public sharing, and agent retrieval until you fix or archive this page.'
);

export const normalizeQualityReview = (page = {}) => {
  const review = page?.qualityReview;
  if (!review || typeof review !== 'object') return null;
  return {
    status: String(review.status || 'ok'),
    severity: String(review.severity || 'ok'),
    surfaceEligible: review.surfaceEligible !== false,
    reasons: Array.isArray(review.reasons)
      ? review.reasons.filter((reason) => reason && (reason.message || reason.code))
      : []
  };
};

export const pageNeedsQualityReview = (page = {}) => {
  const review = normalizeQualityReview(page);
  return review ? review.status !== 'ok' : false;
};

export const isPageQualityBlocked = (page = {}) => {
  const review = normalizeQualityReview(page);
  if (!review) return false;
  return review.severity === 'blocked' || review.surfaceEligible === false;
};

export const qualityReviewLabel = (review = null) => {
  if (!review || review.status === 'ok') return '';
  if (review.severity === 'blocked' || review.surfaceEligible === false) return 'Blocked';
  if (review.status === 'needs_review') return 'Needs review';
  return '';
};

export const formatQualityReviewReasons = (review = null) => (
  (review?.reasons || [])
    .map((reason) => String(reason.message || reason.code || '').trim())
    .filter(Boolean)
);
