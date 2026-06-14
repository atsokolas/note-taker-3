import {
  buildMaintenanceSummary,
  composeReopenLead,
  getWhyItMatters,
  pickReopenCandidate
} from './libraryReadingRoomModel';

describe('libraryReadingRoomModel', () => {
  const articles = [
    {
      _id: 'a1',
      title: 'Recent note',
      createdAt: '2026-06-14T00:00:00Z',
      highlightCount: 2
    },
    {
      _id: 'a2',
      title: "Poor Charlie's Almanack",
      createdAt: '2026-05-01T00:00:00Z',
      highlightCount: 27,
      concepts: [{ name: 'Opportunity Cost' }, { name: 'Circle of Competence' }]
    },
    {
      _id: 'a3',
      title: 'Empty shell',
      createdAt: '2026-06-10T00:00:00Z',
      highlightCount: 0
    }
  ];

  it('picks the strongest reopen candidate by highlights and concepts', () => {
    expect(pickReopenCandidate(articles)?._id).toBe('a2');
  });

  it('composes the reopen lead from real article signal', () => {
    const lead = composeReopenLead(articles[1]);
    expect(lead.headline).toBe("Reopen Poor Charlie's Almanack");
    expect(lead.detail).toMatch(/27 highlights are now pulling toward Opportunity Cost and Circle of Competence/);
  });

  it('reports honest maintenance state when the corpus is unfiled', () => {
    const summary = buildMaintenanceSummary({
      allArticles: [
        { _id: 'u1', highlightCount: 4 },
        { _id: 'u2', highlightCount: 0 }
      ],
      unfiledCount: 2
    });

    expect(summary.status).toBe('unfiled');
    expect(summary.message).toMatch(/still unfiled/i);
    expect(summary.actionLabel).toBe('Review filing suggestions');
    expect(summary.readyToClassify).toBe(1);
  });

  it('prefers excerpt text for why-it-matters when available', () => {
    expect(getWhyItMatters(articles[1], 'Take a simple idea and take it seriously.'))
      .toBe('Take a simple idea and take it seriously.');
  });

  it('excludes suppressed articles from reopen candidate ranking', () => {
    const withCruft = [
      ...articles,
      { _id: 'cruft', title: 'Test', highlightCount: 99, updatedAt: '2026-06-14T00:00:00Z' }
    ];
    expect(pickReopenCandidate(withCruft)?._id).toBe('a2');
  });

  it('adds a cruft maintenance notice when suppressed items exist', () => {
    const summary = buildMaintenanceSummary({
      allArticles: [
        { _id: 'good', title: 'Good read', highlightCount: 2 },
        { _id: 'bad', title: 'Blah', highlightCount: 1 },
        { _id: 'bad2', title: 'Test', highlightCount: 1 }
      ],
      unfiledCount: 0,
      suppressedCount: 2
    });
    expect(summary.cruftNotice).toBe(
      '2 low-signal test items were kept out of your return view.'
    );
  });
});
