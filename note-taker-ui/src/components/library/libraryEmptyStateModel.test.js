import {
  formatLibraryCorpusCount,
  formatLibrarySuppressedCount,
  getLibraryScopeLabel,
  resolveLibraryEmptyState
} from './libraryEmptyStateModel';

describe('libraryEmptyStateModel', () => {
  it('maps scope keys to human labels', () => {
    expect(getLibraryScopeLabel('unfiled')).toBe('Unfiled');
    expect(getLibraryScopeLabel('folder')).toBe('Cabinet');
    expect(getLibraryScopeLabel('all')).toBe('All');
  });

  it('returns first-run when the corpus is truly empty', () => {
    expect(resolveLibraryEmptyState({ scope: 'all', corpusTotal: 0, rawCorpusTotal: 0 })).toEqual({
      kind: 'first-run',
      scopeLabel: 'All'
    });
    expect(resolveLibraryEmptyState({ scope: 'unfiled', corpusTotal: 0, rawCorpusTotal: 0 })).toEqual({
      kind: 'first-run',
      scopeLabel: 'Unfiled'
    });
  });

  it('returns suppressed-empty when only review imports remain hidden', () => {
    expect(resolveLibraryEmptyState({
      scope: 'all',
      corpusTotal: 0,
      rawCorpusTotal: 3,
      suppressedCount: 3
    })).toEqual({
      kind: 'suppressed-empty',
      scopeLabel: 'All',
      suppressedCount: 3,
      emptyLabel: ''
    });
  });

  it('returns scoped-empty when unfiled is empty but the corpus has sources', () => {
    expect(resolveLibraryEmptyState({
      scope: 'unfiled',
      corpusTotal: 253,
      rawCorpusTotal: 253,
      emptyLabel: 'No unfiled articles right now.'
    })).toEqual({
      kind: 'scoped-empty',
      scopeLabel: 'Unfiled',
      corpusTotal: 253,
      emptyLabel: 'No unfiled articles right now.'
    });
  });

  it('returns scoped-empty when a folder scope is empty but corpus has sources', () => {
    expect(resolveLibraryEmptyState({
      scope: 'folder',
      corpusTotal: 12,
      rawCorpusTotal: 12,
      emptyLabel: 'No articles in Research yet.'
    })).toEqual({
      kind: 'scoped-empty',
      scopeLabel: 'Cabinet',
      corpusTotal: 12,
      emptyLabel: 'No articles in Research yet.'
    });
  });

  it('returns search-empty when a query is active', () => {
    expect(resolveLibraryEmptyState({
      scope: 'all',
      corpusTotal: 12,
      query: 'Munger'
    })).toEqual({
      kind: 'search-empty',
      scopeLabel: 'All',
      corpusTotal: 12,
      query: 'Munger'
    });
  });

  it('formats corpus totals with singular/plural copy', () => {
    expect(formatLibraryCorpusCount(1)).toBe('1 source is in Library');
    expect(formatLibraryCorpusCount(253)).toBe('253 sources are in Library');
  });

  it('formats suppressed import counts with singular/plural copy', () => {
    expect(formatLibrarySuppressedCount(1)).toBe('1 review import is hidden from this view');
    expect(formatLibrarySuppressedCount(3)).toBe('3 review imports are hidden from this view');
  });
});
