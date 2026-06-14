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
});
