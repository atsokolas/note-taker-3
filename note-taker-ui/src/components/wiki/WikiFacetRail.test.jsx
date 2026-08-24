import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WikiFacetRail from './WikiFacetRail';

const baseCounts = {
  all: 4,
  needsReview: 1,
  byKind: {
    general: 2,
    repository: 1,
    investment: 1
  },
  byType: {
    overview: 2,
    concept: 1,
    entity: 0,
    source: 0,
    question: 1,
    comparison: 0,
    project: 0,
    log: 0,
    topic: 0
  },
  byStatus: {
    draft: 3,
    published: 1
  },
  byVisibility: {
    private: 3,
    shared: 1
  }
};

describe('WikiFacetRail', () => {
  it('renders search and primary facets with counts', () => {
    render(
      <WikiFacetRail
        query=""
        facetCounts={baseCounts}
        onQueryChange={jest.fn()}
        onSelectAllPages={jest.fn()}
        onSelectNeedsReview={jest.fn()}
      />
    );

    expect(screen.getByTestId('wiki-facet-search')).toBeInTheDocument();
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('Browse your wiki.')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-facet-all-pages')).toHaveTextContent('4');
    expect(screen.getByTestId('wiki-facet-needs-review')).toHaveTextContent('1');
    expect(screen.getByTestId('wiki-facet-kind-general')).toHaveTextContent('2');
    expect(screen.getByTestId('wiki-facet-kind-repository')).toHaveTextContent('1');
    expect(screen.getByTestId('wiki-facet-kind-investment')).toHaveTextContent('1');
  });

  it('calls facet handlers from the rail', () => {
    const onSelectKind = jest.fn();
    const onSelectNeedsReview = jest.fn();
    const onQueryChange = jest.fn();

    render(
      <WikiFacetRail
        query="alpha"
        facetCounts={baseCounts}
        onQueryChange={onQueryChange}
        onSelectNeedsReview={onSelectNeedsReview}
        onSelectKind={onSelectKind}
      />
    );

    fireEvent.change(screen.getByTestId('wiki-facet-search'), { target: { value: 'beta' } });
    fireEvent.click(screen.getByTestId('wiki-facet-needs-review'));
    fireEvent.click(screen.getByTestId('wiki-facet-kind-investment'));

    expect(onQueryChange).toHaveBeenCalledWith('beta');
    expect(onSelectNeedsReview).toHaveBeenCalledTimes(1);
    expect(onSelectKind).toHaveBeenCalledWith('investment');
  });

  it('marks the selected wiki kind', () => {
    render(
      <WikiFacetRail
        kind="repository"
        facetCounts={baseCounts}
      />
    );

    expect(screen.getByTestId('wiki-facet-kind-repository')).toHaveAttribute('aria-pressed', 'true');
  });
});
