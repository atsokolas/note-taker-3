import {
  canonicalWikiPages,
  groupWikiPagesByTitle,
  orderByGrounding,
  titleKeyForPage
} from './wikiTitleGroupModel';

const page = (overrides = {}) => ({
  _id: 'page',
  title: 'Sovereign debt',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...overrides
});

describe('titleKeyForPage', () => {
  it('reads case, spacing, and edge punctuation as the same title', () => {
    expect(titleKeyForPage(page({ title: 'Sovereign Debt' })))
      .toBe(titleKeyForPage(page({ title: '  sovereign   debt.' })));
    expect(titleKeyForPage(page({ title: '“Sovereign debt”' })))
      .toBe(titleKeyForPage(page({ title: 'Sovereign debt' })));
  });

  it('keeps genuinely different titles apart', () => {
    expect(titleKeyForPage(page({ title: 'Sovereign debt' })))
      .not.toBe(titleKeyForPage(page({ title: 'Sovereign debt crises' })));
  });

  it('gives an untitled page no key at all', () => {
    expect(titleKeyForPage(page({ title: '   ' }))).toBe('');
  });
});

describe('orderByGrounding', () => {
  it('puts the page the library grounds ahead of the page it does not', () => {
    const grounded = page({ _id: 'grounded', sourceCount: 3, updatedAt: '2026-01-01T00:00:00.000Z' });
    const bare = page({ _id: 'bare', updatedAt: '2026-08-15T00:00:00.000Z' });
    expect(orderByGrounding([bare, grounded]).map(item => item._id)).toEqual(['grounded', 'bare']);
  });

  it('prefers more evidence when both are grounded', () => {
    const thin = page({ _id: 'thin', sourceCount: 1 });
    const thick = page({ _id: 'thick', sourceCount: 6 });
    expect(orderByGrounding([thin, thick]).map(item => item._id)).toEqual(['thick', 'thin']);
  });

  it('prefers a written page over a scaffold with the same evidence', () => {
    const scaffold = page({ _id: 'scaffold', sourceCount: 2, summary: 'This still needs source-backed development.' });
    const written = page({ _id: 'written', sourceCount: 2, summary: 'Sovereign debt is priced against the issuer.' });
    expect(orderByGrounding([scaffold, written]).map(item => item._id)).toEqual(['written', 'scaffold']);
  });

  it('falls back to recency only once evidence ties', () => {
    const older = page({ _id: 'older', sourceCount: 2, updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = page({ _id: 'newer', sourceCount: 2, updatedAt: '2026-08-01T00:00:00.000Z' });
    expect(orderByGrounding([older, newer]).map(item => item._id)).toEqual(['newer', 'older']);
  });
});

describe('groupWikiPagesByTitle', () => {
  it('folds same-title pages into one group and counts them', () => {
    const groups = groupWikiPagesByTitle([
      page({ _id: 'a', title: 'Sovereign debt' }),
      page({ _id: 'b', title: 'Sovereign Debt', sourceCount: 4 }),
      page({ _id: 'c', title: 'Reflexivity' })
    ]);
    expect(groups).toHaveLength(2);
    const debt = groups.find(group => group.canonical._id === 'b');
    expect(debt.count).toBe(2);
    expect(debt.others.map(item => item._id)).toEqual(['a']);
  });

  it('never folds two untitled pages together', () => {
    const groups = groupWikiPagesByTitle([
      page({ _id: 'a', title: '' }),
      page({ _id: 'b', title: '' })
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every(group => group.count === 1)).toBe(true);
  });

  it('leaves every page reachable — nothing is dropped', () => {
    const pages = [
      page({ _id: 'a', title: 'Sovereign debt' }),
      page({ _id: 'b', title: 'sovereign debt', sourceCount: 4 }),
      page({ _id: 'c', title: 'Sovereign debt ' })
    ];
    const reachable = groupWikiPagesByTitle(pages)
      .flatMap(group => [group.canonical, ...group.others])
      .map(item => item._id)
      .sort();
    expect(reachable).toEqual(['a', 'b', 'c']);
  });

  it('keeps the list in the order the rows were already sorted in', () => {
    const groups = groupWikiPagesByTitle([
      page({ _id: 'first', title: 'Alpha', sourceCount: 1 }),
      page({ _id: 'second', title: 'Beta', sourceCount: 1 }),
      page({ _id: 'third', title: 'Alpha' })
    ]);
    expect(groups.map(group => group.canonical._id)).toEqual(['first', 'second']);
  });

  it('survives a missing list', () => {
    expect(groupWikiPagesByTitle(undefined)).toEqual([]);
    expect(canonicalWikiPages(null)).toEqual([]);
  });
});

describe('canonicalWikiPages', () => {
  it('returns one page per title so counts match the rows', () => {
    const pages = [
      page({ _id: 'a', title: 'Sovereign debt' }),
      page({ _id: 'b', title: 'Sovereign debt', sourceCount: 4 }),
      page({ _id: 'c', title: 'Reflexivity' })
    ];
    expect(canonicalWikiPages(pages).map(item => item._id)).toEqual(['b', 'c']);
  });
});
