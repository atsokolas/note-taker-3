import { createAuthScopedSnapshotCache, getStoredAuthScope } from './authScopedSnapshotCache';

describe('authScopedSnapshotCache', () => {
  it('uses an opaque account scope instead of retaining the bearer token', () => {
    localStorage.setItem('token', 'private-bearer-token');
    expect(getStoredAuthScope()).not.toContain('private-bearer-token');
  });

  it('cannot let an old account request replace the current account snapshot', async () => {
    let scope = 'account-a';
    const releases = {};
    const load = jest.fn(() => new Promise(resolve => { releases[scope] = resolve; }));
    const cache = createAuthScopedSnapshotCache({ ttlMs: 60_000, load, getScope: () => scope });

    const accountA = cache.read();
    await Promise.resolve();
    scope = 'account-b';
    const accountB = cache.read();
    await Promise.resolve();

    releases['account-a']('A');
    releases['account-b']('B');
    await expect(accountA).resolves.toBe('A');
    await expect(accountB).resolves.toBe('B');
    await expect(cache.read()).resolves.toBe('B');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
