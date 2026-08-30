import {
  REVIEW_PROMOTION_LIMIT,
  buildReviewTriage,
  formatReviewTriageFrame,
  reviewFacetCount
} from './reviewTriageModel';

const NOW = new Date('2026-08-30T12:00:00.000Z').getTime();
const page = (id, overrides = {}) => ({
  _id: id,
  title: id,
  freshness: { status: 'needs_review', pendingSourceEventIds: [] },
  updatedAt: new Date(NOW - 2 * 24 * 60 * 60 * 1000),
  ...overrides
});

describe('reviewTriageModel', () => {
  it('ranks judgment pages ahead of visited and drifted pages and caps at three', () => {
    const triage = buildReviewTriage({
      now: NOW,
      pages: [
        page('drift', { freshness: { status: 'needs_review', pendingSourceEventIds: ['1', '2'] } }),
        page('visited', { lastVisitedAt: new Date(NOW - 1000) }),
        page('judgment', { judgment: { kind: 'thesis', currentJudgment: 'Hold cash through the cycle.' } }),
        page('minor-a'),
        page('minor-b')
      ]
    });

    expect(triage.promoted.map((item) => item.pageId)).toEqual(['judgment', 'visited', 'drift']);
    expect(triage.promoted).toHaveLength(REVIEW_PROMOTION_LIMIT);
    expect(triage.promoted[0].reason).toMatch(/Judgment page/i);
    expect(triage.minorCount).toBe(2);
    expect(triage.frame).toBe('3 worth your attention · 2 minor');
  });

  it('stays silent when the queue is empty and never paints a zero as attention', () => {
    expect(formatReviewTriageFrame({ promotedCount: 0, minorCount: 0 })).toBe('');
    expect(formatReviewTriageFrame({ promotedCount: 0, minorCount: 38 })).toBe('38 minor');
    expect(reviewFacetCount(0)).toBeUndefined();
    expect(reviewFacetCount(41)).toBe(3);
    expect(buildReviewTriage({ pages: [], now: NOW }).frame).toBe('');
  });
});
