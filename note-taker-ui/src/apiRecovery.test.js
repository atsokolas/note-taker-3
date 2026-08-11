import { createBackendRecovery, shouldRecoverBackend } from './apiRecovery';

describe('backend wake recovery', () => {
  it('retries transient read failures but never mutations, auth failures, or replayed reads', () => {
    expect(shouldRecoverBackend({ config: { method: 'get' }, response: { status: 503 } })).toBe(true);
    expect(shouldRecoverBackend({ config: { method: 'head' }, code: 'ERR_NETWORK' })).toBe(true);
    expect(shouldRecoverBackend({ config: { method: 'post' }, response: { status: 503 } })).toBe(false);
    expect(shouldRecoverBackend({ config: { method: 'get' }, response: { status: 401 } })).toBe(false);
    expect(shouldRecoverBackend({ config: { method: 'get', __noeisWakeRetry: true }, response: { status: 503 } })).toBe(false);
  });

  it('coalesces concurrent callers into one wake cycle and clears after success', async () => {
    let probes = 0;
    const recover = createBackendRecovery({
      probe: jest.fn(async () => {
        probes += 1;
        if (probes < 2) throw new Error('sleeping');
      }),
      sleep: jest.fn(async () => {}),
      delays: [0, 1]
    });

    const first = recover();
    const second = recover();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(probes).toBe(2);
    await recover();
    expect(probes).toBe(3);
  });

  it('rejects after the bounded probe window', async () => {
    const recover = createBackendRecovery({
      probe: jest.fn(async () => { throw new Error('still sleeping'); }),
      sleep: jest.fn(async () => {}),
      delays: [0, 1, 2]
    });
    await expect(recover()).rejects.toThrow('still sleeping');
  });
});
