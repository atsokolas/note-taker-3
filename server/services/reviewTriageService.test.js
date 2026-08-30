const {
  LOW_STAKES_REVIEW_TTL_DAYS,
  buildReviewTriage
} = require('./reviewTriageService');

const NOW = new Date('2026-08-30T12:00:00.000Z').getTime();
const page = (id, overrides = {}) => ({
  _id: id,
  title: id,
  freshness: { status: 'needs_review', pendingSourceEventIds: [] },
  updatedAt: new Date(NOW - 2 * 24 * 60 * 60 * 1000),
  ...overrides
});

describe('reviewTriageService', () => {
  test('promotes at most three with judgment pages ahead of visited and drifted pages', () => {
    const triage = buildReviewTriage({
      now: NOW,
      pages: [
        page('drift', { freshness: { status: 'needs_review', pendingSourceEventIds: ['1', '2', '3'] } }),
        page('visited', { lastVisitedAt: new Date(NOW - 1000) }),
        page('judgment', { judgment: { kind: 'thesis', currentJudgment: 'A belief.' } }),
        page('minor')
      ]
    });
    expect(triage.promoted.map(item => item.pageId)).toEqual(['judgment', 'visited', 'drift']);
    expect(triage.minorCount).toBe(1);
  });

  test(`expires low-stakes unvisited reviews after ${LOW_STAKES_REVIEW_TTL_DAYS} days`, () => {
    const triage = buildReviewTriage({
      now: NOW,
      pages: [page('repo', {
        title: 'note-taker-3 — repo wiki',
        createdFrom: { type: 'github_repo' },
        updatedAt: new Date(NOW - (LOW_STAKES_REVIEW_TTL_DAYS + 1) * 24 * 60 * 60 * 1000)
      })]
    });
    expect(triage).toMatchObject({ promotedCount: 0, minorCount: 0, expiredCount: 1, totalCount: 0 });
  });
});
