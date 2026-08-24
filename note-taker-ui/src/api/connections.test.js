import api from '../api';
import { clearCachedPrefix } from '../utils/cache';
import {
  createConnection,
  deleteConnection,
  getConnectionsForItem
} from './connections';

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn()
  }
}));

const emptyConnections = { outgoing: [], incoming: [] };

describe('connections API cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'account-a');
    clearCachedPrefix('connections:item:');
    api.get.mockResolvedValue({ data: emptyConnections });
  });

  afterEach(() => {
    localStorage.clear();
    clearCachedPrefix('connections:item:');
  });

  it('coalesces concurrent consumers of the same exact item graph', async () => {
    let release;
    api.get.mockReturnValue(new Promise(resolve => { release = resolve; }));

    const first = getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });
    const second = getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });
    await Promise.resolve();

    expect(api.get).toHaveBeenCalledTimes(1);
    release({ data: emptyConnections });
    await expect(Promise.all([first, second])).resolves.toEqual([
      emptyConnections,
      emptyConnections
    ]);
  });

  it('reuses a fresh graph but partitions it by item, scope, and account', async () => {
    await getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });
    await getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });
    await getConnectionsForItem({
      itemType: 'article',
      itemId: 'article-1',
      scopeType: 'concept',
      scopeId: 'concept-1'
    });
    localStorage.setItem('token', 'account-b');
    await getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });

    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('invalidates exact-item graphs after successful create and delete mutations', async () => {
    api.post.mockResolvedValue({ data: { _id: 'connection-1' } });
    api.delete.mockResolvedValue({ data: { ok: true } });

    await getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });
    await createConnection({
      fromType: 'article',
      fromId: 'article-1',
      toType: 'concept',
      toId: 'concept-1'
    });
    await getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });
    await deleteConnection('connection-1');
    await getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });

    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('cannot let an older in-flight read repopulate the cache after a mutation', async () => {
    let releaseOldRead;
    api.get
      .mockReturnValueOnce(new Promise(resolve => { releaseOldRead = resolve; }))
      .mockResolvedValueOnce({ data: emptyConnections });
    api.post.mockResolvedValue({ data: { _id: 'connection-1' } });

    const oldRead = getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });
    await Promise.resolve();
    await createConnection({
      fromType: 'article',
      fromId: 'article-1',
      toType: 'concept',
      toId: 'concept-1'
    });
    releaseOldRead({ data: emptyConnections });
    await oldRead;
    await getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('force-refreshes one exact graph without disabling normal coalescing', async () => {
    await getConnectionsForItem({ itemType: 'article', itemId: 'article-1' });
    await getConnectionsForItem({ itemType: 'article', itemId: 'article-1', force: true });

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
