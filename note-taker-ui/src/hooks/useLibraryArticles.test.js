import { renderHook, waitFor } from '@testing-library/react';
import useLibraryArticles from './useLibraryArticles';
import { getArticles } from '../api/articles';

jest.mock('../api/articles', () => ({
  getArticles: jest.fn()
}));

jest.mock('../utils/perf', () => ({
  endPerfTimer: jest.fn(() => 1),
  logPerf: jest.fn(),
  startPerfTimer: jest.fn(() => 0)
}));

describe('useLibraryArticles', () => {
  beforeEach(() => {
    getArticles.mockReset();
    getArticles.mockResolvedValue([]);
  });

  it('requests suppressed articles only for explicit review mode', async () => {
    const { rerender } = renderHook(
      ({ includeSuppressed }) => useLibraryArticles({
        scope: 'all',
        folderId: '',
        query: '',
        sort: 'recent',
        includeSuppressed
      }),
      { initialProps: { includeSuppressed: false } }
    );

    await waitFor(() => expect(getArticles).toHaveBeenLastCalledWith({
      scope: 'all',
      includeSuppressed: false
    }));

    rerender({ includeSuppressed: true });

    await waitFor(() => expect(getArticles).toHaveBeenLastCalledWith({
      scope: 'all',
      includeSuppressed: true
    }));
  });

  it('keeps parked sources out of the Imbox and on their own shelves', async () => {
    getArticles.mockResolvedValue([
      { _id: 'open', title: 'In the stream', createdAt: '2026-08-20T00:00:00.000Z' },
      { _id: 'later', title: 'Owed', placement: 'later', createdAt: '2026-08-19T00:00:00.000Z' },
      { _id: 'aside', title: 'At hand', placement: 'setAside', createdAt: '2026-08-18T00:00:00.000Z' }
    ]);

    const later = renderHook(() => useLibraryArticles({ scope: 'later' }));
    const imbox = renderHook(() => useLibraryArticles({ scope: 'all' }));
    const aside = renderHook(() => useLibraryArticles({ scope: 'set-aside' }));

    await waitFor(() => expect(later.result.current.articles.map((item) => item._id)).toEqual(['later']));
    expect(imbox.result.current.articles.map((item) => item._id)).toEqual(['open']);
    expect(aside.result.current.articles.map((item) => item._id)).toEqual(['aside']);
  });

  it('keeps feed-home sources out of the Imbox and on their own scroll', async () => {
    getArticles.mockResolvedValue([
      { _id: 'open', title: 'In the stream', createdAt: '2026-08-20T00:00:00.000Z' },
      {
        _id: 'letter',
        title: 'Weekly letter',
        folder: { _id: 'news', name: 'Newsletters', asFeed: true },
        createdAt: '2026-08-19T00:00:00.000Z',
        firstGraph: 'A finished sentence about power.'
      }
    ]);

    const imbox = renderHook(() => useLibraryArticles({ scope: 'all' }));
    const feed = renderHook(() => useLibraryArticles({ scope: 'feed', folderId: 'news' }));

    await waitFor(() => expect(imbox.result.current.articles.map((item) => item._id)).toEqual(['open']));
    expect(feed.result.current.articles.map((item) => item._id)).toEqual(['letter']);
    expect(getArticles).toHaveBeenCalledWith(expect.objectContaining({
      includePreview: true
    }));
  });
});
