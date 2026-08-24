import api from '../api';
import { clearCachedPrefix } from '../utils/cache';
import {
  getLibraryRoom,
  getLibraryRelevance,
  getLibrarySourceDetail
} from './libraryRelevance';

let mockAuthToken = 'test-only';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: `Bearer ${mockAuthToken}` } })
}));

const mixedPage = ({ nextCursor = null, hasMore = false } = {}) => ({
  view: 'recent',
  sourceScope: 'mixed',
  sources: [{
    source: {
      type: 'highlight',
      id: 'highlight-1',
      parentId: '64f100000000000000000021'
    },
    provenance: { provider: 'readwise' }
  }],
  counts: { recent: { value: 1, exact: true } },
  nextCursor,
  hasMore,
  coverage: { status: 'partial', sourceTypes: ['article', 'highlight', 'note'] },
  generatedAt: '2026-08-06T12:00:00.000Z'
});

describe('Library relevance API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthToken = 'test-only';
    clearCachedPrefix('library-relevance:');
    clearCachedPrefix('library-relevance-detail:');
    clearCachedPrefix('library-room:');
  });

  afterEach(() => {
    clearCachedPrefix('library-relevance:');
    clearCachedPrefix('library-relevance-detail:');
    clearCachedPrefix('library-room:');
  });

  it('loads one fail-closed room projection with sources, shelves, and counts', async () => {
    const payload = {
      ...mixedPage(),
      room: 'library',
      shelves: {
        folders: [{ _id: 'folder-1', name: 'AI & Computing', articleCount: 1 }],
        counts: {
          articles: 1,
          rawArticles: 2,
          unfiledArticles: 1,
          keptArticles: 0,
          suppressedArticles: 1
        }
      }
    };
    api.get.mockResolvedValue({ data: payload });

    await expect(getLibraryRoom()).resolves.toBe(payload);
    await expect(getLibraryRoom()).resolves.toBe(payload);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      '/api/library/room?view=recent&limit=40',
      { headers: { Authorization: 'Bearer test-only' } }
    );
  });

  it('rejects a room response without canonical shelf counts', async () => {
    api.get.mockResolvedValue({
      data: { ...mixedPage(), room: 'library', shelves: { folders: [], counts: {} } }
    });
    await expect(getLibraryRoom()).rejects.toThrow(/room response is malformed/i);
  });

  it('uses the canonical default query, authenticates, caches, and preserves mixed identity', async () => {
    const payload = mixedPage();
    api.get.mockResolvedValue({ data: payload });

    const first = await getLibraryRelevance();
    const second = await getLibraryRelevance();

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      '/api/library/relevance?view=recent&limit=40&sourceScope=mixed',
      { headers: { Authorization: 'Bearer test-only' } }
    );
    expect(first).toBe(payload);
    expect(second.sources[0].source).toEqual({
      type: 'highlight',
      id: 'highlight-1',
      parentId: '64f100000000000000000021'
    });
  });

  it('partitions cursor requests and force-refreshes the exact cache key', async () => {
    api.get
      .mockResolvedValueOnce({ data: mixedPage({ nextCursor: 'next-2', hasMore: true }) })
      .mockResolvedValueOnce({ data: mixedPage() })
      .mockResolvedValueOnce({ data: mixedPage() });

    await getLibraryRelevance();
    await getLibraryRelevance({ cursor: ' next cursor ' });
    await getLibraryRelevance({ cursor: ' next cursor ', force: true });

    expect(api.get).toHaveBeenCalledTimes(3);
    expect(api.get.mock.calls[1][0]).toBe(
      '/api/library/relevance?view=recent&limit=40&sourceScope=mixed&cursor=next+cursor'
    );
    expect(api.get.mock.calls[2][0]).toBe(api.get.mock.calls[1][0]);
  });

  it('partitions list and detail caches across authenticated principals', async () => {
    const source = {
      source: { type: 'article', id: '64f100000000000000000021' },
      provenance: { provider: 'manual' }
    };
    api.get.mockImplementation(path => Promise.resolve({
      data: path.includes('/64f100000000000000000021')
        ? { source, generatedAt: '2026-08-06T12:00:00.000Z' }
        : mixedPage()
    }));

    await getLibraryRelevance();
    await getLibrarySourceDetail('64f100000000000000000021');
    mockAuthToken = 'different-user';
    await getLibraryRelevance();
    await getLibrarySourceDetail('64f100000000000000000021');

    expect(api.get).toHaveBeenCalledTimes(4);
    expect(api.get.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only');
    expect(api.get.mock.calls[2][1].headers.Authorization).toBe('Bearer different-user');
  });

  it('rejects invalid list parameters before transport', async () => {
    await expect(getLibraryRelevance({ view: 'popular' })).rejects.toThrow(/view must be one of/i);
    await expect(getLibraryRelevance({ sourceScope: 'everything' })).rejects.toThrow(/articles or mixed/i);
    await expect(getLibraryRelevance({ limit: 0 })).rejects.toThrow(/1 to 100/i);
    await expect(getLibraryRelevance({ limit: 101 })).rejects.toThrow(/1 to 100/i);
    await expect(getLibraryRelevance({ sourceScope: 'articles', cursor: 'cursor-1' }))
      .rejects.toThrow(/cursor requires mixed/i);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('rejects malformed list envelopes and does not cache transport failures', async () => {
    api.get
      .mockResolvedValueOnce({ data: { view: 'recent', sourceScope: 'mixed', sources: null } })
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ data: mixedPage() });

    await expect(getLibraryRelevance()).rejects.toThrow(/response is malformed/i);
    await expect(getLibraryRelevance()).rejects.toThrow('temporary failure');
    await expect(getLibraryRelevance()).resolves.toEqual(mixedPage());
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('rejects malformed nested list structures and unbound highlight identity', async () => {
    const invalidPages = [
      { ...mixedPage(), counts: [] },
      { ...mixedPage(), coverage: [] },
      {
        ...mixedPage(),
        sources: [{ source: { type: 'wiki_page', id: 'page-1' } }]
      },
      {
        ...mixedPage(),
        sources: [{ source: { type: 'highlight', id: 'highlight-1' } }]
      }
    ];
    api.get.mockImplementation(() => Promise.resolve({ data: invalidPages.shift() }));

    for (let index = 0; index < 4; index += 1) {
      await expect(getLibraryRelevance()).rejects.toThrow(/response is malformed/i);
    }
    expect(api.get).toHaveBeenCalledTimes(4);
  });

  it('returns no detail for an empty id and rejects malformed ids before transport', async () => {
    await expect(getLibrarySourceDetail(' ')).resolves.toBeNull();
    await expect(getLibrarySourceDetail('article-name')).rejects.toThrow(/valid object id/i);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('authenticates and caches a valid source detail without reshaping it', async () => {
    const source = {
      source: { type: 'article', id: '64f100000000000000000021' },
      provenance: { provider: 'manual' }
    };
    api.get.mockResolvedValue({
      data: { source, generatedAt: '2026-08-06T12:00:00.000Z' }
    });

    const first = await getLibrarySourceDetail(' 64f100000000000000000021 ');
    const second = await getLibrarySourceDetail('64f100000000000000000021');

    expect(first).toBe(source);
    expect(second).toBe(source);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      '/api/library/relevance/64f100000000000000000021',
      { headers: { Authorization: 'Bearer test-only' } }
    );
  });

  it('rejects malformed detail responses without caching them', async () => {
    api.get
      .mockResolvedValueOnce({ data: { source: null } })
      .mockResolvedValueOnce({
        data: {
          source: { source: { type: 'article', id: '64f100000000000000000021' } },
          generatedAt: '2026-08-06T12:00:00.000Z'
        }
      });

    await expect(getLibrarySourceDetail('64f100000000000000000021'))
      .rejects.toThrow(/response is malformed/i);
    await expect(getLibrarySourceDetail('64f100000000000000000021')).resolves.toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty or cross-article detail envelope', async () => {
    api.get
      .mockResolvedValueOnce({
        data: { source: {}, generatedAt: '2026-08-06T12:00:00.000Z' }
      })
      .mockResolvedValueOnce({
        data: {
          source: { source: { type: 'article', id: '64f100000000000000000099' } },
          generatedAt: '2026-08-06T12:00:00.000Z'
        }
      });

    await expect(getLibrarySourceDetail('64f100000000000000000021'))
      .rejects.toThrow(/response is malformed/i);
    await expect(getLibrarySourceDetail('64f100000000000000000021'))
      .rejects.toThrow(/response is malformed/i);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
