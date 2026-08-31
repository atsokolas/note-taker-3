import { getCached, setCached } from '../utils/cache';
import { setArticlePlacement } from './articles';
import api from '../api';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer qa' } })
}));

describe('setArticlePlacement', () => {
  beforeEach(() => {
    api.patch.mockReset();
  });

  it('clears article and library room caches so Later still reads after reload', async () => {
    api.patch.mockResolvedValue({
      data: { _id: 'a1', placement: 'later', placementAt: '2026-08-31T12:00:00.000Z' }
    });
    setCached('articles:/api/articles', [{ _id: 'a1', placement: 'stream' }], { ttlMs: 30_000 });
    setCached('library-room:auth:/api/library/room', { shelves: { counts: { laterArticles: 0 } } }, { ttlMs: 30_000 });
    setCached('library-relevance:auth:/api/library/relevance', { counts: {} }, { ttlMs: 30_000 });

    const saved = await setArticlePlacement('a1', 'later');

    expect(saved.placement).toBe('later');
    expect(api.patch).toHaveBeenCalledWith(
      '/articles/a1/placement',
      { placement: 'later' },
      expect.anything()
    );
    expect(getCached('articles:/api/articles')).toBeUndefined();
    expect(getCached('library-room:auth:/api/library/room')).toBeUndefined();
    expect(getCached('library-relevance:auth:/api/library/relevance')).toBeUndefined();
  });
});
