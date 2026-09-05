import { isSeen, isSeenFoldRow, partitionSeen, SEEN_FOLD_LABEL, SEEN_FOLD_ROW } from './seenModel';

describe('new for you vs previously seen', () => {
  it('splits opened from unopened and keeps both in order', () => {
    const rows = [
      { _id: 'a', lastOpenedAt: '2026-08-01T00:00:00.000Z' },
      { _id: 'b' },
      { _id: 'c', lastOpenedAt: '2026-08-02T00:00:00.000Z' },
      { _id: 'd' }
    ];
    const { fresh, seen } = partitionSeen(rows);
    expect(fresh.map(row => row._id)).toEqual(['b', 'd']);
    expect(seen.map(row => row._id)).toEqual(['a', 'c']);
  });

  it('reads the stamp off the article at hand when the row does not carry it', () => {
    const byId = new Map([['a1', { lastOpenedAt: '2026-08-01T00:00:00.000Z' }]]);
    expect(isSeen({ source: { type: 'article', id: 'a1' } }, byId)).toBe(true);
    expect(isSeen({ source: { type: 'article', id: 'a2' } }, byId)).toBe(false);
  });

  it('treats a stamp the server never sent as new, never as seen', () => {
    expect(isSeen({ _id: 'a' })).toBe(false);
    expect(isSeen({})).toBe(false);
    expect(isSeen()).toBe(false);
  });

  it('keeps notes and highlights in the flow above the fold', () => {
    const { fresh, seen } = partitionSeen([
      { source: { type: 'note', id: 'n1' } },
      { source: { type: 'highlight', id: 'h1' } },
      { _id: 'a1', lastOpenedAt: '2026-08-01T00:00:00.000Z' }
    ]);
    expect(fresh).toHaveLength(2);
    expect(seen).toHaveLength(1);
  });

  it('names the fold and recognizes its sentinel', () => {
    expect(SEEN_FOLD_LABEL).toBe('Seen earlier');
    expect(isSeenFoldRow(SEEN_FOLD_ROW)).toBe(true);
    expect(isSeenFoldRow({ _id: 'a' })).toBe(false);
    expect(isSeenFoldRow()).toBe(false);
  });
});
