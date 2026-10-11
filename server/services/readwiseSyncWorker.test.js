const { drainDueReadwiseSyncs, dueReadwiseQuery } = require('./readwiseSyncWorker');

const connectionStore = (connections = []) => {
  const calls = [];
  return {
    calls,
    find(query) {
      calls.push(query);
      return {
        sort: () => ({ limit: async () => connections })
      };
    }
  };
};

const connection = (overrides = {}) => ({
  _id: 'rw-1',
  status: 'connected',
  health: 'healthy',
  lastError: '',
  save: jest.fn(async () => {}),
  ...overrides
});

describe('Readwise on a timer', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  let consoleError;
  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('asks only for connected Readwise connections that hold a credential and are due', () => {
    const cutoff = new Date('2026-10-11T08:00:00Z');
    expect(dueReadwiseQuery(cutoff)).toEqual({
      provider: 'readwise',
      status: 'connected',
      $and: [
        { $or: [{ encryptedApiToken: { $nin: ['', null] } }, { encryptedAccessToken: { $nin: ['', null] } }] },
        { $or: [{ lastSyncAt: null }, { lastSyncAt: { $lte: cutoff } }] }
      ]
    });
  });

  it('does nothing for a reader without a Readwise connection', async () => {
    const store = connectionStore([]);
    const syncConnection = jest.fn();
    const result = await drainDueReadwiseSyncs({ IntegrationConnection: store, syncConnection, now });
    expect(syncConnection).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, failed: 0, importedHighlights: 0 });
    expect(store.calls[0].$and[1].$or[1].lastSyncAt.$lte).toEqual(new Date('2026-10-11T08:00:00Z'));
  });

  it('runs the shared import quietly and adds up what came in', async () => {
    const first = connection({ _id: 'rw-1' });
    const second = connection({ _id: 'rw-2' });
    const syncConnection = jest.fn()
      .mockResolvedValueOnce({ result: { importedHighlights: 14 } })
      .mockResolvedValueOnce({ result: { importedHighlights: 0 } });
    const result = await drainDueReadwiseSyncs({
      IntegrationConnection: connectionStore([first, second]),
      syncConnection,
      now
    });
    expect(syncConnection).toHaveBeenNthCalledWith(1, { connection: first, recordEmpty: false });
    expect(syncConnection).toHaveBeenNthCalledWith(2, { connection: second, recordEmpty: false });
    expect(result).toEqual({ processed: 2, failed: 0, importedHighlights: 14 });
  });

  it('sets aside a connection Readwise refuses, and retries one that merely failed', async () => {
    const refused = connection({ _id: 'rw-refused' });
    const flaky = connection({ _id: 'rw-flaky' });
    const authError = Object.assign(new Error('401'), { response: { status: 401 } });
    const syncConnection = jest.fn()
      .mockRejectedValueOnce(authError)
      .mockRejectedValueOnce(new Error('socket hang up'));
    const result = await drainDueReadwiseSyncs({
      IntegrationConnection: connectionStore([refused, flaky]),
      syncConnection,
      now
    });
    expect(result).toEqual({ processed: 0, failed: 2, importedHighlights: 0 });
    expect(refused.status).toBe('error');
    expect(refused.lastError).toMatch(/Reconnect/);
    expect(refused.lastError).not.toMatch(/Readwise|token/i);
    expect(refused.save).toHaveBeenCalled();
    expect(flaky.status).toBe('connected');
    expect(flaky.save).not.toHaveBeenCalled();
  });
});
