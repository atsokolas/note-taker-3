import {
  BLOCKED_SURFACE_EXPLANATION,
  formatQualityReviewReasons,
  isPageQualityBlocked,
  normalizeQualityReview,
  pageNeedsQualityReview,
  qualityReviewLabel
} from './wikiPageQualityReview';

describe('wikiPageQualityReview', () => {
  it('detects pages that need quality review', () => {
    expect(pageNeedsQualityReview({
      qualityReview: { status: 'ok', severity: 'ok', surfaceEligible: true, reasons: [] }
    })).toBe(false);
    expect(pageNeedsQualityReview({
      qualityReview: {
        status: 'needs_review',
        severity: 'review',
        surfaceEligible: true,
        reasons: [{ code: 'sparse_unsourced_draft', message: 'Page is sparse and has no attached sources.' }]
      }
    })).toBe(true);
  });

  it('labels blocked pages and formats reasons', () => {
    const review = normalizeQualityReview({
      qualityReview: {
        status: 'needs_review',
        severity: 'blocked',
        surfaceEligible: false,
        reasons: [
          { code: 'placeholder_title', message: 'Page title contains placeholder/debug wording.' }
        ]
      }
    });

    expect(isPageQualityBlocked({ qualityReview: review })).toBe(true);
    expect(qualityReviewLabel(review)).toBe('Blocked');
    expect(formatQualityReviewReasons(review)).toEqual([
      'Page title contains placeholder/debug wording.'
    ]);
    expect(BLOCKED_SURFACE_EXPLANATION).toMatch(/Explore/i);
  });
});
