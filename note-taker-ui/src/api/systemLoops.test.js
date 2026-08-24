import api from '../api';
import { getSystemLoops } from './systemLoops';
import { NOEIS_LOOP_IDS } from '../system/noeisLoopModel';

jest.mock('../api', () => ({ get: jest.fn() }));

const response = () => ({
  schemaVersion: 1,
  generatedAt: '2026-08-22T12:00:00.000Z',
  loops: Object.fromEntries(NOEIS_LOOP_IDS.map(id => [id, {
    id, status: 'idle', reason: 'Nothing is due.', updatedAt: null, href: '/wiki', receipt: null, metrics: {}
  }]))
});

describe('system loop api', () => {
  it('reads the authenticated durable loop projection', async () => {
    api.get.mockResolvedValue({ data: response() });
    const result = await getSystemLoops();
    expect(api.get).toHaveBeenCalledWith('/api/system/loops', expect.any(Object));
    expect(result.loops['loop.morning-paper'].status).toBe('idle');
  });

  it('rejects malformed server state', async () => {
    api.get.mockResolvedValue({ data: { schemaVersion: 1, generatedAt: 'bad', loops: {} } });
    await expect(getSystemLoops()).rejects.toThrow(/malformed/i);
  });
});
