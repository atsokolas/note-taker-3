import { act, renderHook, waitFor } from '@testing-library/react';
import useLibraryRoom from './useLibraryRoom';
import { getLibraryRelevance, getLibraryRoom } from '../api/libraryRelevance';

jest.mock('../api/libraryRelevance', () => ({
  getLibraryRelevance: jest.fn(),
  getLibraryRoom: jest.fn()
}));

const roomPayload = {
  sources: [{ source: { type: 'article', id: 'article-1', title: 'First' } }],
  coverage: { status: 'partial' },
  counts: { recent: { value: 2, exact: true } },
  shelves: {
    folders: [{ _id: 'folder-1', name: 'AI', articleCount: 1 }],
    counts: {
      articles: 2,
      rawArticles: 2,
      unfiledArticles: 1,
      keptArticles: 0,
      suppressedArticles: 0
    }
  },
  nextCursor: 'next-1',
  hasMore: true
};

describe('useLibraryRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLibraryRoom.mockResolvedValue(roomPayload);
  });

  it('hydrates the landing room from one projection request', async () => {
    const { result } = renderHook(() => useLibraryRoom());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getLibraryRoom).toHaveBeenCalledWith({
      view: 'recent',
      limit: 40,
      showSuppressed: false
    });
    expect(result.current.sources).toHaveLength(1);
    expect(result.current.folders[0].name).toBe('AI');
    expect(result.current.shelfCounts.articles).toBe(2);
  });

  it('continues through the bounded relevance cursor without reloading shelves', async () => {
    getLibraryRelevance.mockResolvedValue({
      sources: [{ source: { type: 'note', id: 'note-2', title: 'Second' } }],
      coverage: { status: 'partial' },
      counts: roomPayload.counts,
      nextCursor: null,
      hasMore: false
    });
    const { result } = renderHook(() => useLibraryRoom());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.loadMore());

    expect(getLibraryRelevance).toHaveBeenCalledWith({
      view: 'recent',
      limit: 40,
      sourceScope: 'mixed',
      showSuppressed: false,
      cursor: 'next-1'
    });
    expect(result.current.sources).toHaveLength(2);
    expect(result.current.folders).toEqual(roomPayload.shelves.folders);
  });
});
