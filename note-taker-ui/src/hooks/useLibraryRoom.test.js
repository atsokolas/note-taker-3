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
      laterArticles: 0,
      setAsideArticles: 0,
      suppressedArticles: 0
    },
    piles: { later: [], setAside: [] }
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

  it('lets Keep bump the shelf count before the room refetches', async () => {
    const { result } = renderHook(() => useLibraryRoom());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.adjustShelfCount('keptArticles', 1);
    });
    expect(result.current.shelfCounts.keptArticles).toBe(1);
  });

  it('files a parked source onto the Later pile before the room refetches', async () => {
    const { result } = renderHook(() => useLibraryRoom());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.upsertPileArticle({ _id: 'a1', title: 'Owed a move' }, 'later');
      result.current.adjustShelfCount('laterArticles', 1);
    });
    expect(result.current.piles.later.map((item) => item._id)).toEqual(['a1']);
    expect(result.current.shelfCounts.laterArticles).toBe(1);
  });

  it('opens review as a three-item triage before the user requests the backlog', async () => {
    const { result } = renderHook(() => useLibraryRoom({ view: 'needs_review' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getLibraryRoom).toHaveBeenCalledWith({
      view: 'needs_review',
      limit: 3,
      showSuppressed: false
    });
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
