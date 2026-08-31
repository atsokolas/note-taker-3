import { act, renderHook, waitFor } from '@testing-library/react';
import { getArticleEvergreen, setArticleEvergreen } from '../../../api/articles';
import useNotebookSourceEvergreen from './useNotebookSourceEvergreen';

jest.mock('../../../api/articles', () => ({
  getArticleEvergreen: jest.fn(),
  setArticleEvergreen: jest.fn()
}));

const entryFrom = (articleId = 'article-1') => ({
  _id: 'note-1',
  blocks: [{
    id: 'block-1',
    type: 'highlight_embed',
    articleId,
    articleTitle: 'A beautiful source',
    highlightId: 'highlight-1'
  }]
});

describe('useNotebookSourceEvergreen', () => {
  beforeEach(() => {
    getArticleEvergreen.mockReset();
    setArticleEvergreen.mockReset();
  });

  it('reads the authoritative Keep state and persists a new choice', async () => {
    getArticleEvergreen.mockResolvedValue({ evergreen: false, evergreenAt: null });
    setArticleEvergreen.mockResolvedValue({ evergreen: true, evergreenAt: '2026-08-31T12:00:00.000Z' });
    const { result } = renderHook(() => useNotebookSourceEvergreen(entryFrom()));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.evergreen).toBe(false);

    await act(async () => result.current.setEvergreen(true));
    expect(setArticleEvergreen).toHaveBeenCalledWith('article-1', true);
    expect(result.current.evergreen).toBe(true);
  });

  it('fails closed when the source cannot be read', async () => {
    getArticleEvergreen.mockRejectedValue(new Error('not found'));
    const { result } = renderHook(() => useNotebookSourceEvergreen(entryFrom('foreign')));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.evergreen).toBe(false);
  });

  it('does not carry a late Keep response onto another note', async () => {
    let finishKeep;
    getArticleEvergreen
      .mockResolvedValueOnce({ evergreen: false, evergreenAt: null })
      .mockResolvedValueOnce({ evergreen: false, evergreenAt: null });
    setArticleEvergreen.mockReturnValue(new Promise(resolve => { finishKeep = resolve; }));
    const { result, rerender } = renderHook(
      ({ entry }) => useNotebookSourceEvergreen(entry),
      { initialProps: { entry: entryFrom('article-1') } }
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    let pendingKeep;
    act(() => { pendingKeep = result.current.setEvergreen(true); });
    rerender({ entry: entryFrom('article-2') });
    await waitFor(() => expect(result.current.articleId).toBe('article-2'));

    await act(async () => {
      finishKeep({ evergreen: true, evergreenAt: '2026-08-31T12:00:00.000Z' });
      await pendingKeep;
    });
    expect(result.current.articleId).toBe('article-2');
    expect(result.current.evergreen).toBe(false);
  });
});
