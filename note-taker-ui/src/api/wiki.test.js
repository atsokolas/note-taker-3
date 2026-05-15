import api from '../api';
import { TextDecoder, TextEncoder } from 'util';
import { streamMaintainWikiPage } from './wiki';

jest.mock('../api', () => ({
  defaults: { baseURL: '' },
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  put: jest.fn()
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: jest.fn(() => ({ headers: { Authorization: 'Bearer token' } }))
}));

describe('wiki api streams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    global.TextDecoder = TextDecoder;
    window.localStorage.setItem('token', 'token');
  });

  afterEach(() => {
    delete global.fetch;
    delete global.TextDecoder;
    window.localStorage.clear();
  });

  it('reads streamed maintenance events and page snapshots', async () => {
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
    const events = [];
    const pages = [];

    const finalPage = await streamMaintainWikiPage('wiki-1', {}, {
      onEvent: (event, payload) => events.push([event, payload.stage]),
      onPage: (page) => pages.push(page.title)
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('/api/wiki/pages/wiki-1/ai/draft/stream', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' })
    }));
    expect(finalPage).toEqual({ _id: 'wiki-1', title: 'Complete' });
    expect(events).toContainEqual(['wiki-draft', 'connected']);
    expect(pages).toEqual(['Maintaining', 'Complete']);
  });
});
