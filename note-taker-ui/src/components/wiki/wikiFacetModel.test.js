import {
  computeWikiFacetCounts,
  isWikiAllPagesActive,
  wikiKindForPage
} from './wikiFacetModel';

describe('wikiFacetModel', () => {
  it('computes facet counts from the loaded page set', () => {
    const counts = computeWikiFacetCounts([
      {
        _id: '1',
        pageType: 'overview',
        status: 'draft',
        visibility: 'private'
      },
      {
        _id: '2',
        pageType: 'concept',
        status: 'published',
        visibility: 'shared',
        qualityReview: { status: 'needs_review' }
      },
      {
        _id: '3',
        pageType: 'repo',
        status: 'published',
        visibility: 'private'
      },
      {
        _id: '4',
        pageType: 'entity',
        investmentDossier: { version: 2 },
        status: 'draft',
        visibility: 'private'
      }
    ]);

    expect(counts.all).toBe(4);
    expect(counts.needsReview).toBe(1);
    expect(counts.byType.overview).toBe(1);
    expect(counts.byType.concept).toBe(1);
    expect(counts.byStatus.draft).toBe(2);
    expect(counts.byStatus.published).toBe(2);
    expect(counts.byVisibility.private).toBe(3);
    expect(counts.byVisibility.shared).toBe(1);
    expect(counts.byKind).toEqual({ general: 2, repository: 1, investment: 1 });
  });

  it('derives the visible kind flag from the page contract', () => {
    expect(wikiKindForPage({ wikiKind: 'investment' })).toBe('investment');
    expect(wikiKindForPage({ pageType: 'repo' })).toBe('repository');
    expect(wikiKindForPage({ pageType: 'entity', investmentDossier: { version: 2 } })).toBe('investment');
    expect(wikiKindForPage({ pageType: 'topic' })).toBe('general');
  });

  it('treats all pages as active only when no facet filters are set', () => {
    expect(isWikiAllPagesActive()).toBe(true);
    expect(isWikiAllPagesActive({ kind: 'investment' })).toBe(false);
    expect(isWikiAllPagesActive({ pageType: 'concept' })).toBe(false);
    expect(isWikiAllPagesActive({ needsReviewFilter: true })).toBe(false);
  });
});
