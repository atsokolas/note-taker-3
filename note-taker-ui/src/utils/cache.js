const cacheStore = new Map();

export const getCached = (key) => cacheStore.get(key);

export const setCached = (key, value) => {
  cacheStore.set(key, value);
  return value;
};

export const clearCached = (key) => {
  if (!key) {
    cacheStore.clear();
    return;
  }
  cacheStore.delete(key);
};

export const fetchWithCache = async (key, fetcher, { force = false } = {}) => {
  if (!force && cacheStore.has(key)) {
    return cacheStore.get(key);
  }
  const data = await fetcher();
  cacheStore.set(key, data);
  return data;
};
