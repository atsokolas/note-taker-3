import { buildLibraryColumn, librarySubject, sourceLabel } from './libraryColumnModel';

const article = (overrides = {}) => ({
  _id: 'a1',
  title: 'A saved source',
  updatedAt: '2026-08-12T10:00:00.000Z',
  ...overrides
});

describe('sourceLabel', () => {
  it('prefers what the publication calls itself', () => {
    expect(sourceLabel(article({ source: 'SemiAnalysis' }))).toBe('SemiAnalysis');
    expect(sourceLabel(article({ publisher: 'Nvidia' }))).toBe('Nvidia');
  });

  it('falls back to the author, then to the site', () => {
    expect(sourceLabel(article({ author: 'James Dale Davidson' }))).toBe('James Dale Davidson');
    expect(sourceLabel(article({ url: 'https://www.semianalysis.com/p/spec' }))).toBe('Semianalysis');
  });

  it('says nothing rather than inventing a source', () => {
    expect(sourceLabel(article())).toBe('');
    expect(sourceLabel(article({ url: 'not a url' }))).toBe('');
  });
});

describe('buildLibraryColumn', () => {
  const articles = [
    article({ _id: 'a1', title: 'Old but marked up', highlights: [{ _id: 'h1' }, { _id: 'h2' }], updatedAt: '2026-01-01T00:00:00.000Z', source: 'SemiAnalysis', summary: 'A technical read.' }),
    article({ _id: 'a2', title: 'Newest', updatedAt: '2026-08-14T00:00:00.000Z', source: 'Nvidia' }),
    article({ _id: 'a3', title: 'Middle', updatedAt: '2026-05-01T00:00:00.000Z' })
  ];

  it('continues the source you left highlights in, not merely the newest', () => {
    const { continueItem } = buildLibraryColumn({ articles });

    expect(continueItem).toEqual(expect.objectContaining({
      id: 'a1',
      title: 'Old but marked up',
      source: 'SemiAnalysis',
      dek: 'A technical read.'
    }));
  });

  it('lists the rest newest first and never twice', () => {
    const { rows } = buildLibraryColumn({ articles });

    expect(rows.map(row => row.id)).toEqual(['a2', 'a3']);
    expect(rows[0]).toEqual(expect.objectContaining({ title: 'Newest', source: 'Nvidia' }));
  });

  it('prefers the full corpus over the current filter when both are present', () => {
    const { rows } = buildLibraryColumn({ articles: [articles[1]], allArticles: articles });

    expect(rows.map(row => row.id)).toEqual(['a2', 'a3']);
  });

  it('hides parked articles from Continue and the shelf', () => {
    const { continueItem, rows } = buildLibraryColumn({
      articles: [
        ...articles,
        article({
          _id: 'parked',
          title: 'Owed a move',
          placement: 'later',
          highlights: [{ _id: 'h-parked' }],
          updatedAt: '2026-08-20T00:00:00.000Z'
        })
      ]
    });

    expect(continueItem.id).toBe('a1');
    expect(rows.map(row => row.id)).toEqual(['a2', 'a3']);
  });

  it('has nothing to continue on an empty shelf', () => {
    expect(buildLibraryColumn({ articles: [] })).toEqual({ continueItem: null, rows: [] });
  });
});

describe('librarySubject', () => {
  it('names the source being read', () => {
    expect(librarySubject({ article: { title: 'Inside the Model Spec' }, count: 12 }))
      .toBe('Inside the Model Spec');
  });

  it('counts the shelf when nothing is open', () => {
    expect(librarySubject({ count: 12 })).toBe('12 sources on the shelf.');
    expect(librarySubject({ count: 1 })).toBe('1 source on the shelf.');
    expect(librarySubject({ count: 0 })).toBe('Your library.');
  });
});
