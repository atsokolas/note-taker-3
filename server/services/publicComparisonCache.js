const DEFAULT_PUBLIC_COMPARISON_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PUBLIC_PAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PUBLIC_COMPARISON_CACHE_MAX_ENTRIES = 50;

const createPublicComparisonCache = ({
  ttlMs = DEFAULT_PUBLIC_COMPARISON_CACHE_TTL_MS,
  maxEntries = DEFAULT_PUBLIC_COMPARISON_CACHE_MAX_ENTRIES,
  now = () => Date.now()
} = {}) => {
  const entries = new Map();
  const safeTtlMs = Math.max(1000, Number(ttlMs) || DEFAULT_PUBLIC_COMPARISON_CACHE_TTL_MS);
  const safeMaxEntries = Math.max(1, Number(maxEntries) || DEFAULT_PUBLIC_COMPARISON_CACHE_MAX_ENTRIES);

  const get = (key) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey) return null;
    const cached = entries.get(normalizedKey);
    if (!cached) return null;
    if (cached.expiresAt <= now()) {
      entries.delete(normalizedKey);
      return null;
    }
    entries.delete(normalizedKey);
    entries.set(normalizedKey, cached);
    return cached.value;
  };

  const set = (key, value) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey || !value) return;
    entries.delete(normalizedKey);
    entries.set(normalizedKey, { value, expiresAt: now() + safeTtlMs });
    while (entries.size > safeMaxEntries) {
      entries.delete(entries.keys().next().value);
    }
  };

  return { get, set, size: () => entries.size };
};

module.exports = {
  DEFAULT_PUBLIC_COMPARISON_CACHE_MAX_ENTRIES,
  DEFAULT_PUBLIC_COMPARISON_CACHE_TTL_MS,
  DEFAULT_PUBLIC_PAGE_CACHE_TTL_MS,
  createPublicComparisonCache
};
