import {
  isFeedArticle,
  isImboxArticle,
  isImboxSource,
  isParked,
  laterPileLine,
  mergeArticles,
  normalizePlacement,
  orderLaterOldestFirst,
  orderSetAsideNewestFirst,
  placementOf,
  setAsidePileLine
} from './placementModel';

const NOW = new Date('2026-08-31T12:00:00.000Z').getTime();

describe('placement', () => {
  it('treats missing placement as the stream', () => {
    expect(placementOf({})).toBe('stream');
    expect(normalizePlacement('')).toBe('stream');
    expect(normalizePlacement('later')).toBe('later');
    expect(normalizePlacement('nope')).toBe('');
    expect(isParked({ placement: 'later' })).toBe(true);
    expect(isImboxArticle({ placement: 'setAside' })).toBe(false);
    expect(isImboxArticle({ title: 'In the Imbox' })).toBe(true);
  });

  it('treats an unparked source in a screened folder as feed-home, not Imbox', () => {
    const newsletter = {
      title: 'Weekly letter',
      folder: { _id: 'news', name: 'Newsletters', asFeed: true }
    };
    expect(isFeedArticle(newsletter)).toBe(true);
    expect(isImboxArticle(newsletter)).toBe(false);
    expect(isImboxArticle({
      ...newsletter,
      placement: 'later'
    })).toBe(false);
    expect(isFeedArticle({
      ...newsletter,
      placement: 'later'
    })).toBe(false);
    expect(isImboxArticle({
      title: 'Costco filed as work',
      folder: { _id: 'work', name: 'Costco', asFeed: false }
    })).toBe(true);
    expect(isFeedArticle({ title: 'Unfiled' })).toBe(false);
  });

  it('orders Later oldest owed first, Set aside newest on top', () => {
    const later = [
      { _id: 'new', placement: 'later', placementAt: '2026-08-20T00:00:00.000Z' },
      { _id: 'old', placement: 'later', placementAt: '2026-06-01T00:00:00.000Z' },
      { _id: 'stream', placement: 'stream' }
    ];
    expect(orderLaterOldestFirst(later).map((item) => item._id)).toEqual(['old', 'new']);

    const aside = [
      { _id: 'old', placement: 'setAside', placementAt: '2026-06-01T00:00:00.000Z' },
      { _id: 'new', placement: 'setAside', placementAt: '2026-08-20T00:00:00.000Z' }
    ];
    expect(orderSetAsideNewestFirst(aside).map((item) => item._id)).toEqual(['new', 'old']);
  });

  it('stays silent when a pile is empty', () => {
    expect(laterPileLine([])).toBe('');
    expect(setAsidePileLine([{ placement: 'stream' }])).toBe('');
  });

  it('names the weight of a pile without a zero', () => {
    expect(laterPileLine([
      { _id: 'a', placement: 'later', placementAt: '2026-08-20T00:00:00.000Z' }
    ], NOW)).toBe('One thing owed a move.');
    expect(setAsidePileLine([
      { _id: 'a', placement: 'setAside', placementAt: '2026-01-04T00:00:00.000Z' },
      { _id: 'b', placement: 'setAside', placementAt: '2026-08-20T00:00:00.000Z' }
    ], NOW)).toBe('2 things at hand · oldest since January 2026');
  });

  it('keeps Later and Set aside as different words', () => {
  });

  it('hides parked articles from the Imbox source list, including their highlights', () => {
    const articlesById = new Map([
      ['parked', { _id: 'parked', placement: 'later' }],
      ['open', { _id: 'open', placement: 'stream' }]
    ]);
    expect(isImboxSource({ type: 'article', id: 'open' }, articlesById)).toBe(true);
    expect(isImboxSource({ type: 'article', id: 'parked' }, articlesById)).toBe(false);
    expect(isImboxSource({ type: 'highlight', id: 'h1', parentId: 'parked' }, articlesById)).toBe(false);
    expect(isImboxSource({ type: 'note', id: 'n1' }, articlesById)).toBe(true);
  });

  it('hides feed-home articles from the Imbox source list, including their highlights', () => {
    const articlesById = new Map([
      ['feed', { _id: 'feed', folder: { asFeed: true } }],
      ['open', { _id: 'open', folder: { asFeed: false } }]
    ]);
    expect(isImboxSource({ type: 'article', id: 'open' }, articlesById)).toBe(true);
    expect(isImboxSource({ type: 'article', id: 'feed' }, articlesById)).toBe(false);
    expect(isImboxSource({ type: 'highlight', id: 'h1', parentId: 'feed' }, articlesById)).toBe(false);
  });

  it('merges pile members onto known articles without duplicating them', () => {
    const merged = mergeArticles(
      [{ _id: 'a1', title: 'One', placement: 'stream' }],
      [{ _id: 'a1', placement: 'later', placementAt: '2026-08-20T00:00:00.000Z' }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(expect.objectContaining({
      _id: 'a1',
      title: 'One',
      placement: 'later'
    }));
  });
});
