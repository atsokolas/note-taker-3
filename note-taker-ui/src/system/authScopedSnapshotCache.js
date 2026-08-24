const emptySnapshot = (scope = '') => ({
  scope,
  value: undefined,
  cachedAt: 0,
  pending: null
});

const fingerprint = (value) => {
  const text = String(value || '');
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${text.length}:${first >>> 0}:${second >>> 0}`;
};

// The cache needs to notice an account switch, not retain the credential that
// proves the account. A short-lived dual fingerprint gives it that boundary
// without copying the bearer token into another long-lived module variable.
export const getStoredAuthScope = () => fingerprint(
  typeof window === 'undefined' ? '' : window.localStorage?.getItem('token')
);

export const createAuthScopedSnapshotCache = ({ ttlMs, load, normalize = value => value, getScope = getStoredAuthScope }) => {
  let snapshot = emptySnapshot();

  const read = async ({ force = false } = {}) => {
    const scope = getScope();
    if (snapshot.scope !== scope) snapshot = emptySnapshot(scope);
    const scopedSnapshot = snapshot;
    const fresh = scopedSnapshot.value !== undefined && (Date.now() - scopedSnapshot.cachedAt) < ttlMs;
    if (!force && fresh) return scopedSnapshot.value;
    if (scopedSnapshot.pending) return scopedSnapshot.pending;

    scopedSnapshot.pending = Promise.resolve()
      .then(load)
      .then(normalize)
      .then((value) => {
        if (snapshot === scopedSnapshot) {
          scopedSnapshot.value = value;
          scopedSnapshot.cachedAt = Date.now();
        }
        return value;
      })
      .finally(() => { scopedSnapshot.pending = null; });
    return scopedSnapshot.pending;
  };

  return Object.freeze({
    read,
    reset: () => { snapshot = emptySnapshot(); }
  });
};
