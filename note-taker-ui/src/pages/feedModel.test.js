import {
  FEED_RAIL_CAP,
  feedEmptyLine,
  firstGraphOf,
  orderFeedNewestFirst,
  rankFeedTopics,
  screenWordLabel
} from './feedModel';

describe('feed', () => {
  const newsletter = (overrides = {}) => ({
    _id: 'n1',
    title: 'The letter',
    siteName: 'Stratechery',
    folder: { _id: 'news', name: 'Newsletters', asFeed: true },
    updatedAt: '2026-08-20T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  });

  it('opens on the first graph, not the HTML body', () => {
    expect(firstGraphOf({
      firstGraph: 'A finished sentence about power.',
      content: '<p>Ignored body that would be a second download.</p>'
    })).toBe('A finished sentence about power.');

    expect(firstGraphOf({
      content: '<p>The morning paper has a finished lead. The second sentence keeps running with extra material about sources, graph drift, and multiple page updates that would otherwise get cut awkwardly in the middle of the thought.</p>'
    })).toBe('The morning paper has a finished lead.');
  });

  it('stacks unparked members newest first and leaves parked ones to their pile', () => {
    const stacked = orderFeedNewestFirst([
      newsletter({ _id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      newsletter({ _id: 'parked', placement: 'later', updatedAt: '2026-08-30T00:00:00.000Z' }),
      newsletter({ _id: 'new', updatedAt: '2026-08-20T00:00:00.000Z' }),
      { _id: 'imbox', title: 'Work', folder: { _id: 'work', asFeed: false } }
    ]);
    expect(stacked.map((item) => item._id)).toEqual(['new', 'old']);
  });

  it('ranks at most seven screened topics by the newest unparked arrival', () => {
    const folders = [
      { _id: 'empty', name: 'Quiet', asFeed: true },
      { _id: 'work', name: 'Needs Review', asFeed: true },
      { _id: 'news', name: 'Newsletters', asFeed: true },
      { _id: 'macro', name: 'Macro', asFeed: true },
      ...Array.from({ length: 8 }, (_, index) => ({
        _id: `extra-${index}`,
        name: `Topic ${index}`,
        asFeed: true
      }))
    ];
    const articles = [
      newsletter({ folder: { _id: 'news', asFeed: true }, updatedAt: '2026-08-20T00:00:00.000Z' }),
      newsletter({
        _id: 'parked-news',
        folder: { _id: 'news', asFeed: true },
        placement: 'later',
        updatedAt: '2026-08-31T00:00:00.000Z'
      }),
      newsletter({
        _id: 'macro-1',
        folder: { _id: 'macro', asFeed: true },
        updatedAt: '2026-07-01T00:00:00.000Z'
      }),
      ...Array.from({ length: 8 }, (_, index) => newsletter({
        _id: `e-${index}`,
        folder: { _id: `extra-${index}`, asFeed: true },
        updatedAt: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`
      }))
    ];

    const topics = rankFeedTopics(folders, articles);
    expect(topics).toHaveLength(FEED_RAIL_CAP);
    expect(topics[0]).toEqual(expect.objectContaining({ id: 'news', name: 'Newsletters' }));
    expect(topics.map((topic) => topic.id)).not.toContain('empty');
    expect(topics.map((topic) => topic.id)).not.toContain('work');
    expect(topics.map((topic) => topic.name).join(' ')).not.toMatch(/Feed/i);
  });

  it('stays silent when nothing is screened', () => {
    expect(rankFeedTopics([{ _id: 'work', name: 'Costco' }], [{ folder: { _id: 'work' } }])).toEqual([]);
    expect(feedEmptyLine('Newsletters')).toMatch(/Newsletters/);
    expect(feedEmptyLine('Newsletters')).not.toMatch(/Feed \(0\)|Reminders/i);
    expect(screenWordLabel(false)).toBe('Read as feed');
    expect(screenWordLabel(true)).toBe('Keep in Library');
  });
});
