import { computeWikiFacetCounts, isWikiAllPagesActive } from './wikiFacetModel';

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
      }
    ]);

    expect(counts.all).toBe(2);
    expect(counts.needsReview).toBe(1);
    expect(counts.byType.overview).toBe(1);
    expect(counts.byType.concept).toBe(1);
    expect(counts.byStatus.draft).toBe(1);
    expect(counts.byStatus.published).toBe(1);
    expect(counts.byVisibility.private).toBe(1);
    expect(counts.byVisibility.shared).toBe(1);
  });

  it('treats all pages as active only when no facet filters are set', () => {
    expect(isWikiAllPagesActive()).toBe(true);
    expect(isWikiAllPagesActive({ pageType: 'concept' })).toBe(false);
    expect(isWikiAllPagesActive({ needsReviewFilter: true })).toBe(false);
  });
});
