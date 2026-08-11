import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LibrarySourceMemory from './LibrarySourceMemory';
import { getLibraryRelevance } from '../../api/libraryRelevance';

jest.mock('../../api/libraryRelevance', () => ({
  getLibraryRelevance: jest.fn()
}));

const connectedRow = {
  source: {
    type: 'article',
    id: 'article-1',
    title: 'A source with a durable use',
    href: '/library?articleId=article-1',
    sourceUrl: 'https://example.com/source'
  },
  createdAt: '2026-07-27T12:00:00.000Z',
  provenance: {
    provider: 'readwise',
    author: 'Ada Example'
  },
  relevance: {
    connectedCount: 2,
    movementCount: 1,
    connected: [
      {
        type: 'concept',
        id: 'concept-1',
        title: 'Inference economics',
        href: '/think?tab=concepts&concept=Inference%20economics'
      },
      {
        type: 'wiki_claim',
        id: 'claim-1',
        parentId: 'page-1',
        title: 'Costs decline with utilization',
        href: '/wiki/workspace?page=page-1&claimId=claim-1'
      }
    ]
  }
};

const noteRow = {
  source: {
    type: 'note',
    id: 'note-1',
    title: 'A notebook entry',
    href: '/think?tab=notebook&entryId=note-1'
  },
  createdAt: '2026-07-28T12:00:00.000Z',
  provenance: { provider: 'notebook' },
  relevance: { connectedCount: 0, movementCount: 0, connected: [] }
};

describe('LibrarySourceMemory', () => {
  beforeEach(() => {
    getLibraryRelevance.mockReset();
    getLibraryRelevance.mockResolvedValue({
      view: 'recent',
      sourceScope: 'mixed',
      sources: [connectedRow],
      nextCursor: null,
      hasMore: false,
      counts: {},
      coverage: { status: 'partial' }
    });
  });

  it('renders durable provenance and opens the existing reader', async () => {
    const onSelectArticle = jest.fn();
    render(
      <LibrarySourceMemory
        onSelectArticle={onSelectArticle}
        view="recent"
        onViewChange={() => {}}
      />
    );

    expect(await screen.findByText('A source with a durable use')).toBeInTheDocument();
    expect(screen.getByText(/article · Ada Example · readwise/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Concept Inference economics/ }))
      .toHaveAttribute('href', '/think?tab=concepts&concept=Inference%20economics');
    expect(screen.getByRole('link', { name: /Claim Costs decline with utilization/ }))
      .toHaveAttribute('href', '/wiki/workspace?page=page-1&claimId=claim-1');
    expect(screen.getByText('1 material change')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open A source with a durable use' }));
    expect(onSelectArticle).toHaveBeenCalledWith('article-1');
    await waitFor(() => expect(getLibraryRelevance).toHaveBeenCalledWith({
      view: 'recent',
      limit: 40,
      sourceScope: 'mixed'
    }));
  });

  it('requests each factual view without relabeling local data', async () => {
    getLibraryRelevance
      .mockResolvedValueOnce({
        view: 'recent',
        sourceScope: 'mixed',
        sources: [connectedRow],
        nextCursor: null,
        hasMore: false
      })
      .mockResolvedValueOnce({
        view: 'unconnected',
        sourceScope: 'mixed',
        sources: [],
        nextCursor: null,
        hasMore: false
      });
    const onViewChange = jest.fn();
    const { rerender } = render(
      <LibrarySourceMemory
        onSelectArticle={() => {}}
        view="recent"
        onViewChange={onViewChange}
      />
    );
    await screen.findByText('A source with a durable use');

    fireEvent.click(screen.getByRole('tab', { name: /Unconnected/ }));
    expect(onViewChange).toHaveBeenCalledWith('unconnected');
    rerender(
      <LibrarySourceMemory
        onSelectArticle={() => {}}
        view="unconnected"
        onViewChange={onViewChange}
      />
    );
    await waitFor(() => expect(getLibraryRelevance).toHaveBeenLastCalledWith({
      view: 'unconnected',
      limit: 40,
      sourceScope: 'mixed'
    }));
    expect(await screen.findByText('Every visible source is connected.')).toBeInTheDocument();
  });

  it('shows a quiet error without replacing the rest of Library', async () => {
    getLibraryRelevance.mockRejectedValue({
      response: { data: { error: 'Could not trace sources.' } }
    });
    render(
      <LibrarySourceMemory
        onSelectArticle={() => {}}
        view="recent"
        onViewChange={() => {}}
      />
    );
    expect(await screen.findByText('Could not trace sources.')).toBeInTheDocument();
    expect(screen.getAllByText('Could not trace sources.')).toHaveLength(1);
  });

  it('supports keyboard tab navigation and reports only canonically visible sources', async () => {
    const onViewChange = jest.fn();
    const onDataChange = jest.fn();
    render(
      <LibrarySourceMemory
        view="recent"
        onViewChange={onViewChange}
        allowedSourceIds={new Set(['other-source'])}
        renderRows={false}
        onDataChange={onDataChange}
      />
    );

    const recentTab = screen.getByRole('tab', { name: /Recently added/ });
    fireEvent.keyDown(recentTab, { key: 'ArrowRight' });
    expect(onViewChange).toHaveBeenCalledWith('active');
    await waitFor(() => expect(onDataChange).toHaveBeenCalledWith(expect.objectContaining({
      loading: false,
      sources: []
    })));
    expect(screen.queryByText('A source with a durable use')).not.toBeInTheDocument();
  });

  it('labels exact and bounded view counts without presenting estimates as exact', async () => {
    getLibraryRelevance.mockResolvedValueOnce({
      view: 'recent',
      sourceScope: 'mixed',
      sources: [connectedRow],
      nextCursor: null,
      hasMore: false,
      counts: {
        recent: { value: 28, exact: true },
        active: { value: 7, exact: false },
        needs_review: { value: 0, exact: true },
        unconnected: { value: 21, exact: false }
      }
    });

    render(
      <LibrarySourceMemory
        view="recent"
        onViewChange={() => {}}
        renderRows={false}
      />
    );

    expect(await screen.findByRole('tab', { name: 'Recently added, 28 sources' }))
      .toHaveTextContent('28');
    expect(screen.getByRole('tab', { name: 'Active in my thinking, 7 or more sources' }))
      .toHaveTextContent('7+');
    expect(screen.getByRole('tab', { name: 'Needs review, 0 sources' }))
      .toHaveTextContent('0');
  });

  it('appends mixed cursor pages once and ignores repeated clicks while loading', async () => {
    let resolveMore;
    getLibraryRelevance
      .mockResolvedValueOnce({
        view: 'recent',
        sourceScope: 'mixed',
        sources: [noteRow],
        nextCursor: 'cursor-1',
        hasMore: true
      })
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveMore = resolve;
      }));

    const onDataChange = jest.fn();
    render(
      <LibrarySourceMemory
        view="recent"
        onViewChange={() => {}}
        renderRows={false}
        onDataChange={onDataChange}
      />
    );

    await waitFor(() => expect(onDataChange).toHaveBeenCalledWith(expect.objectContaining({
      loading: false,
      hasMore: true,
      sources: [noteRow]
    })));

    const loadMore = onDataChange.mock.calls.at(-1)[0].loadMore;
    await act(async () => {
      loadMore();
      loadMore();
      loadMore();
    });

    await waitFor(() => expect(getLibraryRelevance).toHaveBeenCalledTimes(2));
    expect(getLibraryRelevance).toHaveBeenLastCalledWith({
      view: 'recent',
      limit: 40,
      sourceScope: 'mixed',
      cursor: 'cursor-1'
    });

    await act(async () => {
      resolveMore({
        view: 'recent',
        sourceScope: 'mixed',
        sources: [connectedRow, noteRow],
        nextCursor: null,
        hasMore: false
      });
    });

    await waitFor(() => expect(onDataChange).toHaveBeenCalledWith(expect.objectContaining({
      loadingMore: false,
      hasMore: false,
      sources: [noteRow, connectedRow]
    })));
  });

  it('keeps loaded rows when an append fails and exposes a retryable pagination error', async () => {
    getLibraryRelevance
      .mockResolvedValueOnce({
        view: 'recent',
        sourceScope: 'mixed',
        sources: [noteRow],
        nextCursor: 'cursor-1',
        hasMore: true
      })
      .mockRejectedValueOnce({
        response: { data: { error: 'Cursor request failed.' } }
      });

    const onDataChange = jest.fn();
    render(
      <LibrarySourceMemory
        view="recent"
        onViewChange={() => {}}
        renderRows={false}
        onDataChange={onDataChange}
      />
    );

    await waitFor(() => expect(onDataChange).toHaveBeenCalledWith(expect.objectContaining({
      sources: [noteRow],
      hasMore: true
    })));
    const loadMore = onDataChange.mock.calls.at(-1)[0].loadMore;
    await act(async () => loadMore());
    await waitFor(() => expect(onDataChange).toHaveBeenCalledWith(expect.objectContaining({
      sources: [noteRow],
      hasMore: true,
      error: '',
      paginationError: 'Cursor request failed.'
    })));
  });
});
