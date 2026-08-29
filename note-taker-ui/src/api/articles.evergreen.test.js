import { getCached, setCached } from '../utils/cache';
import { setArticleEvergreen } from './articles';
import api from '../api';

jest.mock('../api', () => ({
  __esModule: true,
  default: { patch: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer qa' } })
}));

describe('setArticleEvergreen', () => {
  it('clears article and library room caches so Keep still reads after reload', async () => {
    api.patch.mockResolvedValue({
      data: { _id: 'a1', evergreen: true, evergreenAt: '2026-08-29T12:00:00.000Z' }
    });
    setCached('articles:/api/articles', [{ _id: 'a1', evergreen: false }], { ttlMs: 30_000 });
    setCached('library-room:auth:/api/library/room', { shelves: { counts: { keptArticles: 0 } } }, { ttlMs: 30_000 });
    setCached('library-relevance:auth:/api/library/relevance', { counts: {} }, { ttlMs: 30_000 });

    const saved = await setArticleEvergreen('a1', true);

    expect(saved.evergreen).toBe(true);
    expect(api.patch).toHaveBeenCalledWith(
      '/articles/a1/evergreen',
      { evergreen: true },
      expect.anything()
    );
    expect(getCached('articles:/api/articles')).toBeUndefined();
    expect(getCached('library-room:auth:/api/library/room')).toBeUndefined();
    expect(getCached('library-relevance:auth:/api/library/relevance')).toBeUndefined();
  });
});
