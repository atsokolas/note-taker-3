const cacheStore = new Map();
const pendingStore = new Map();

const now = () => Date.now();

const isFresh = (entry) => {
  if (!entry) return false;
  if (!entry.expiresAt) return true;
  return entry.expiresAt > now();
};

export const getCached = (key) => {
  const entry = cacheStore.get(key);
  return isFresh(entry) ? entry.value : undefined;
};

export const setCached = (key, value, { ttlMs = 0 } = {}) => {
  cacheStore.set(key, {
    value,
    expiresAt: ttlMs > 0 ? now() + ttlMs : 0
  });
  return value;
};

export const clearCached = (key) => {
  if (!key) {
    cacheStore.clear();
    pendingStore.clear();
    return;
  }
  cacheStore.delete(key);
  pendingStore.delete(key);
};

export const clearCachedPrefix = (prefix) => {
  const safePrefix = String(prefix || '');
  if (!safePrefix) return;
  for (const key of cacheStore.keys()) {
    if (String(key).startsWith(safePrefix)) cacheStore.delete(key);
  }
  for (const key of pendingStore.keys()) {
    if (String(key).startsWith(safePrefix)) pendingStore.delete(key);
  }
};

export const fetchWithCache = async (key, fetcher, { force = false, ttlMs = 0 } = {}) => {
  const cached = cacheStore.get(key);
  if (!force && isFresh(cached)) {
    return cached.value;
  }
  if (!force && pendingStore.has(key)) {
    return pendingStore.get(key);
  }
  const request = Promise.resolve()
    .then(fetcher)
    .then((data) => setCached(key, data, { ttlMs }))
    .finally(() => {
      pendingStore.delete(key);
    });
  pendingStore.set(key, request);
  return request;
};
