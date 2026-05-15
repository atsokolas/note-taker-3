import api from '../api';
import { clearCached } from '../utils/cache';
import {
  getWikiAutolinkSuggestions,
  getWikiPage,
  listWikiAutolinks,
  maintainWikiPage,
  prefetchWikiPage
} from './wiki';

jest.mock('../api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  put: jest.fn()
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: jest.fn(() => ({ headers: { Authorization: 'Bearer token' } }))
}));

describe('wiki api cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCached();
  });

  it('coalesces concurrent wiki page reads and reuses the cached page', async () => {
    api.get.mockResolvedValue({ data: { _id: 'wiki-1', title: 'Cached page' } });

    const [first, second] = await Promise.all([
      getWikiPage('wiki-1'),
      getWikiPage('wiki-1')
    ]);
    const third = await getWikiPage('wiki-1');

    expect(first).toEqual({ _id: 'wiki-1', title: 'Cached page' });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][0]).toBe('/api/wiki/pages/wiki-1');
  });

  it('shares the autolink cache between raw suggestions and normalized list calls', async () => {
    api.get.mockResolvedValue({ data: { suggestions: [{ pageId: 'wiki-2' }], scanned: 12 } });

    const raw = await getWikiAutolinkSuggestions('wiki-1');
    const normalized = await listWikiAutolinks('wiki-1');

    expect(raw).toEqual({ suggestions: [{ pageId: 'wiki-2' }], scanned: 12 });
    expect(normalized).toEqual({ suggestions: [{ pageId: 'wiki-2' }], scanned: 12 });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][0]).toBe('/api/wiki/pages/wiki-1/autolinks');
  });

  it('invalidates page caches after maintenance mutates a page', async () => {
    api.get
      .mockResolvedValueOnce({ data: { _id: 'wiki-1', title: 'Before' } })
      .mockResolvedValueOnce({ data: { _id: 'wiki-1', title: 'After' } });
    api.post.mockResolvedValue({ data: { _id: 'wiki-1', title: 'Maintained' } });

    await getWikiPage('wiki-1');
    await maintainWikiPage('wiki-1');
    const after = await getWikiPage('wiki-1');

    expect(after).toEqual({ _id: 'wiki-1', title: 'After' });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('prefetches through the same page cache', async () => {
    api.get.mockResolvedValue({ data: { _id: 'wiki-1', title: 'Prefetched' } });

    await prefetchWikiPage('wiki-1');
    const page = await getWikiPage('wiki-1');

    expect(page).toEqual({ _id: 'wiki-1', title: 'Prefetched' });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
