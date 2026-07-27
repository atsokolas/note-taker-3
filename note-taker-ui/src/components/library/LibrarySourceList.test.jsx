import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LibrarySourceList from './LibrarySourceList';

const mixedSources = [
  {
    source: {
      type: 'note',
      id: 'note-1',
      title: 'Notebook entry about inference',
      href: '/think?tab=notebook&entryId=note-1'
    },
    createdAt: '2026-07-30T12:00:00.000Z',
    provenance: { provider: 'notebook', noteType: 'reflection' },
    relevance: {
      connectedCount: 1,
      movementCount: 0,
      connected: [{
        type: 'concept',
        id: 'c1',
        title: 'Inference economics',
        href: '/think?tab=concepts&concept=Inference%20economics'
      }]
    }
  },
  {
    source: {
      type: 'highlight',
      id: 'highlight-1',
      parentId: 'article-1',
      title: 'Costs decline with utilization',
      href: '/library?articleId=article-1&highlightId=highlight-1'
    },
    createdAt: '2026-07-29T12:00:00.000Z',
    provenance: {
      provider: 'readwise',
      parentTitle: 'A durable article',
      author: 'Ada Example'
    },
    relevance: {
      connectedCount: 1,
      movementCount: 1,
      connected: [{
        type: 'wiki_claim',
        id: 'claim-1',
        parentId: 'page-1',
        title: 'Utilization drives cost',
        href: '/wiki/workspace?page=page-1&claimId=claim-1'
      }]
    }
  },
  {
    source: {
      type: 'article',
      id: 'article-1',
      title: 'A durable article',
      href: '/library?articleId=article-1'
    },
    createdAt: '2026-07-28T12:00:00.000Z',
    provenance: { provider: 'readwise', author: 'Ada Example' },
    relevance: { connectedCount: 0, movementCount: 0, connected: [] }
  }
];

const renderList = (props = {}) => render(
  <MemoryRouter>
    <LibrarySourceList
      sources={mixedSources}
      loading={false}
      error=""
      emptyLabel="None"
      onSelectSource={() => {}}
      {...props}
    />
  </MemoryRouter>
);

describe('LibrarySourceList', () => {
  it('renders article, highlight, and notebook rows in one canonical list', () => {
    renderList();
    expect(screen.getByTestId('library-source-list')).toBeInTheDocument();
    expect(screen.getByText('Notebook entry about inference')).toBeInTheDocument();
    expect(screen.getByText('Costs decline with utilization')).toBeInTheDocument();
    expect(screen.getByText('A durable article')).toBeInTheDocument();
    expect(screen.getByText('Notebook')).toBeInTheDocument();
    expect(screen.getByText('Highlight')).toBeInTheDocument();
    expect(screen.getByText('Article')).toBeInTheDocument();
  });

  it('selects highlight and notebook rows with exact source identity', () => {
    const onSelectSource = jest.fn();
    renderList({ onSelectSource });

    fireEvent.click(screen.getByRole('button', {
      name: 'Open highlight: Costs decline with utilization'
    }));
    expect(onSelectSource).toHaveBeenCalledWith(expect.objectContaining({
      type: 'highlight',
      id: 'highlight-1',
      parentId: 'article-1'
    }));

    fireEvent.click(screen.getByRole('button', {
      name: 'Open notebook entry: Notebook entry about inference'
    }));
    expect(onSelectSource).toHaveBeenCalledWith(expect.objectContaining({
      type: 'note',
      id: 'note-1'
    }));
  });

  it('marks the selected source row for the composition preview', () => {
    renderList({ selectedSourceKey: 'highlight:highlight-1:article-1' });
    const selected = screen.getByText('Costs decline with utilization')
      .closest('[data-source-key]');
    expect(selected).toHaveClass('is-selected');
    expect(selected).toHaveAttribute('aria-selected', 'true');
  });

  it('places an inline provenance preview immediately after the selected source', () => {
    renderList({
      selectedSourceKey: 'highlight:highlight-1:article-1',
      inlinePreview: <div data-testid="preview-probe">Inline provenance</div>
    });
    const block = screen.getByText('Costs decline with utilization')
      .closest('[data-source-block-key]');
    expect(block).toHaveClass('is-selected-block');
    expect(block.querySelector('[data-testid="library-inline-preview"]'))
      .toHaveTextContent('Inline provenance');
    expect(screen.queryByTestId('preview-probe')).toBeInTheDocument();
    const titles = screen.getAllByTestId('library-source-open').map(node => node.textContent);
    expect(titles[0]).toMatch(/Notebook entry/i);
    expect(titles[1]).toMatch(/Costs decline/i);
  });

  it('preserves durable destinations and article Move without selecting the row', () => {
    const onSelectSource = jest.fn();
    const onMoveArticle = jest.fn();
    renderList({
      onSelectSource,
      onMoveArticle,
      articles: [{ _id: 'article-1', title: 'A durable article' }]
    });

    expect(screen.getByRole('link', { name: /Claim Utilization drives cost/ }))
      .toHaveAttribute('href', '/wiki/workspace?page=page-1&claimId=claim-1');
    expect(screen.getByRole('link', { name: /Concept Inference economics/ }))
      .toHaveAttribute('href', '/think?tab=concepts&concept=Inference%20economics');

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(onMoveArticle).toHaveBeenCalledWith(expect.objectContaining({ _id: 'article-1' }));
    expect(onSelectSource).not.toHaveBeenCalled();
  });

  it('filters mixed source types through search and wires load-more', () => {
    const onLoadMore = jest.fn();
    const onQueryChange = jest.fn();
    renderList({
      query: 'notebook',
      onQueryChange,
      hasMore: true,
      onLoadMore
    });

    expect(screen.getByText('Notebook entry about inference')).toBeInTheDocument();
    expect(screen.queryByText('A durable article')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search sources')).toHaveValue('notebook');

    fireEvent.change(screen.getByLabelText('Search sources'), {
      target: { value: 'utilization' }
    });
    expect(onQueryChange).toHaveBeenCalledWith('utilization');

    fireEvent.click(screen.getByTestId('library-source-load-more'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows honest partial coverage and disables load-more while loading', () => {
    renderList({
      coverage: { status: 'partial', limitations: ['material_movements_limited_to_50'] },
      hasMore: true,
      loadingMore: true,
      onLoadMore: jest.fn()
    });
    expect(screen.getByTestId('library-source-coverage')).toHaveTextContent(/bounded mixed-source scan/i);
    expect(screen.getByTestId('library-source-load-more')).toBeDisabled();
    expect(screen.getByTestId('library-source-load-more')).toHaveTextContent('Loading more…');
  });

  it('omits a false source-scan warning when recent coverage is exact', () => {
    renderList({
      coverage: { status: 'partial', limitations: ['material_movements_limited_to_50'] },
      counts: { recent: { value: 3, exact: true } },
      sourceView: 'recent'
    });
    expect(screen.queryByTestId('library-source-coverage')).not.toBeInTheDocument();
  });

  it('retains loaded rows and reports a pagination error without replacing the list', () => {
    renderList({ paginationError: 'Could not load more sources.' });
    expect(screen.getByText('Notebook entry about inference')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/loaded sources are still available/i);
  });

  it('does not repeat Notebook as both type and provider metadata', () => {
    renderList();
    const noteRow = screen.getByText('Notebook entry about inference')
      .closest('[data-source-type="note"]');
    expect(noteRow).toHaveTextContent('Notebook');
    expect(noteRow).not.toHaveTextContent(/Notebook\s*·\s*Notebook/i);
  });

  it('discloses filtered review imports even while other source types remain visible', () => {
    renderList({
      sources: [mixedSources[0]],
      filteredOutCount: 2,
      suppressedVisible: false,
      sourceView: 'active',
      query: 'notebook'
    });

    expect(screen.getByText('Notebook entry about inference')).toBeInTheDocument();
    expect(screen.getByTestId('library-source-suppressed-notice'))
      .toHaveTextContent('2 sources are hidden by review-import filters.');
    expect(screen.getByRole('link', { name: 'Show review imports' }))
      .toHaveAttribute('href', '/library?scope=all&showSuppressed=1&sourceView=active&aq=notebook');
  });
});
