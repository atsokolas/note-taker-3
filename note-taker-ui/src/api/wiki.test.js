import api from '../api';
import { TextDecoder, TextEncoder } from 'util';
import { clearCached } from '../utils/cache';
import {
  getWikiAutolinkSuggestions,
  getWikiPage,
  listWikiAutolinks,
  maintainWikiPage,
  prefetchWikiPage,
  streamMaintainWikiPage
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
    global.fetch = jest.fn();
    global.TextDecoder = TextDecoder;
    window.localStorage.setItem('token', 'token');
  });

  afterEach(() => {
    delete global.fetch;
    delete global.TextDecoder;
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

  it('reads streamed maintenance events and invalidates the page cache', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: wiki-draft\ndata: {"stage":"connected"}\n\n',
      'event: wiki-page\ndata: {"stage":"maintaining","page":{"_id":"wiki-1","title":"Maintaining"}}\n\n',
      'event: wiki-page\ndata: {"stage":"complete","page":{"_id":"wiki-1","title":"Complete"}}\n\n',
      'event: done\ndata: {"ok":true}\n\n'
    ].map(chunk => encoder.encode(chunk));
    const read = jest.fn()
      .mockResolvedValueOnce({ done: false, value: chunks[0] })
      .mockResolvedValueOnce({ done: false, value: chunks[1] })
      .mockResolvedValueOnce({ done: false, value: chunks[2] })
      .mockResolvedValueOnce({ done: false, value: chunks[3] })
      .mockResolvedValueOnce({ done: true });
    global.fetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read }) }
    });
    api.get
      .mockResolvedValueOnce({ data: { _id: 'wiki-1', title: 'Before' } })
      .mockResolvedValueOnce({ data: { _id: 'wiki-1', title: 'After stream' } });
    const events = [];
    const pages = [];

    await getWikiPage('wiki-1');
    const finalPage = await streamMaintainWikiPage('wiki-1', {}, {
      onEvent: (event, payload) => events.push([event, payload.stage]),
      onPage: (page) => pages.push(page.title)
    });
    const after = await getWikiPage('wiki-1');

    expect(global.fetch).toHaveBeenCalledWith('/api/wiki/pages/wiki-1/ai/draft/stream', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' })
    }));
    expect(finalPage).toEqual({ _id: 'wiki-1', title: 'Complete' });
    expect(events).toContainEqual(['wiki-draft', 'connected']);
    expect(pages).toEqual(['Maintaining', 'Complete']);
    expect(after).toEqual({ _id: 'wiki-1', title: 'After stream' });
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
