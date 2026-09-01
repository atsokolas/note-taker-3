import { getCached, setCached } from '../utils/cache';
import { setFolderAsFeed } from './folders';
import api from '../api';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer qa' } })
}));

describe('setFolderAsFeed', () => {
  beforeEach(() => {
    api.patch.mockReset();
  });

  it('clears folder and library room caches so screening survives reload', async () => {
    api.patch.mockResolvedValue({
      data: { _id: 'news', name: 'Newsletters', asFeed: true }
    });
    setCached('folders.withCounts', [{ _id: 'news', asFeed: false }], { ttlMs: 30_000 });
    setCached('library-room:auth:/api/library/room', { shelves: { feedTopics: [] } }, { ttlMs: 30_000 });
    setCached('articles:/api/articles', [{ _id: 'a1' }], { ttlMs: 30_000 });

    const saved = await setFolderAsFeed('news', true);

    expect(saved.asFeed).toBe(true);
    expect(api.patch).toHaveBeenCalledWith(
      '/folders/news/feed',
      { asFeed: true },
      expect.anything()
    );
    expect(getCached('folders.withCounts')).toBeUndefined();
    expect(getCached('library-room:auth:/api/library/room')).toBeUndefined();
    expect(getCached('articles:/api/articles')).toBeUndefined();
  });
});
