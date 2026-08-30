const {
  LOW_STAKES_REVIEW_TTL_DAYS,
  REVIEW_PROMOTION_LIMIT,
  buildReviewTriage,
  expireLowStakesReviews,
  formatReviewTriageFrame
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
        page('minor'),
        page('also-minor')
      ]
    });
    expect(triage.promoted.map(item => item.pageId)).toEqual(['judgment', 'visited', 'drift']);
    expect(triage.promoted).toHaveLength(REVIEW_PROMOTION_LIMIT);
    expect(triage.promoted[0].reason).toMatch(/Judgment page/i);
    expect(triage.minorCount).toBe(2);
    expect(triage.frame).toBe('3 worth your attention · 2 minor');
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
    expect(triage).toMatchObject({
      promotedCount: 0,
      minorCount: 0,
      expiredCount: 1,
      totalCount: 0,
      frame: ''
    });
  });

  test('revives an expired review when newer source activity arrives', () => {
    const triage = buildReviewTriage({
      now: NOW,
      pages: [page('repo', {
        title: 'note-taker-3 — repo wiki',
        createdFrom: { type: 'github_repo' },
        freshness: {
          status: 'needs_review',
          pendingSourceEventIds: ['fresh-event'],
          reviewExpiredAt: new Date(NOW - 2 * 24 * 60 * 60 * 1000),
          lastSourceEventAt: new Date(NOW - 24 * 60 * 60 * 1000)
        }
      })]
    });

    expect(triage.promoted.map(item => item.pageId)).toEqual(['repo']);
    expect(triage.expiredCount).toBe(0);
  });

  test('never expires a judgment page through the low-stakes policy', () => {
    const triage = buildReviewTriage({
      now: NOW,
      pages: [page('judgment-edition', {
        title: 'System thesis',
        createdFrom: { type: 'research_edition' },
        judgment: { kind: 'investment' },
        freshness: {
          status: 'needs_review',
          reviewExpiredAt: new Date(NOW - 24 * 60 * 60 * 1000),
          lastReviewedAt: new Date(NOW - 60 * 24 * 60 * 60 * 1000)
        }
      })]
    });

    expect(triage.promoted.map(item => item.pageId)).toEqual(['judgment-edition']);
    expect(triage.expiredCount).toBe(0);
  });

  test('stays silent when nothing remains to review', () => {
    expect(formatReviewTriageFrame({ promotedCount: 0, minorCount: 0 })).toBe('');
    expect(buildReviewTriage({ pages: [], now: NOW }).frame).toBe('');
  });

  test('does not print a zero as worth-your-attention', () => {
    expect(formatReviewTriageFrame({ promotedCount: 0, minorCount: 38 })).toBe('38 minor');
    expect(formatReviewTriageFrame({ promotedCount: 2, minorCount: 0 })).toBe('2 worth your attention');
  });

  test('inks expiry on low-stakes pages without accepting them', async () => {
    const updates = [];
    const WikiPage = {
      updateMany: async (query, update, options) => {
        updates.push({ query, update, options });
        return { acknowledged: true };
      }
    };
    const expired = page('repo', {
      title: 'note-taker-3 — repo wiki',
      createdFrom: { type: 'github_repo' },
      updatedAt: new Date(NOW - (LOW_STAKES_REVIEW_TTL_DAYS + 1) * 24 * 60 * 60 * 1000)
    });
    const stamped = await expireLowStakesReviews({
      WikiPage,
      userId: 'user-1',
      now: NOW,
      pages: [expired, page('fresh-judgment', { judgment: { kind: 'thesis' } })]
    });
    expect(stamped).toBe(1);
    expect(updates[0].query._id.$in).toEqual(['repo']);
    expect(updates[0].update.$set['freshness.reviewExpiredAt']).toEqual(new Date(NOW));
    expect(updates[0].update.$set.lastReviewedAt).toBeUndefined();
    expect(updates[0].options).toEqual({ timestamps: false });
  });
});
