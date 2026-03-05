import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSemanticRelated } from '../api/retrieval';

const CACHE_TTL_MS = 60 * 1000;
const semanticCache = new Map();

const normalizeTypes = (types) => {
  const rawList = Array.isArray(types)
    ? types
    : String(types || '').split(',');
  const next = rawList
    .map(type => String(type || '').trim().toLowerCase())
    .filter(Boolean);
  return next.length > 0 ? Array.from(new Set(next)) : ['highlight'];
};

const buildCacheKey = ({ sourceType, sourceId, resultTypes }) => (
  `${sourceType}:${sourceId}:${normalizeTypes(resultTypes).join(',')}`
);

const readCache = (key) => {
  const hit = semanticCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > CACHE_TTL_MS) {
    semanticCache.delete(key);
    return null;
  }
  return hit.value;
};

const writeCache = (key, value) => {
  semanticCache.set(key, {
    cachedAt: Date.now(),
    value
  });
};

const useSemanticRelated = ({
  sourceType,
  sourceId,
  limit = 6,
  resultTypes = ['highlight'],
  enabled = true
} = {}) => {
  const safeSourceType = String(sourceType || '').trim().toLowerCase();
  const safeSourceId = String(sourceId || '').trim();
  const safeTypes = useMemo(() => normalizeTypes(resultTypes), [resultTypes]);
  const cacheKey = useMemo(
    () => buildCacheKey({ sourceType: safeSourceType, sourceId: safeSourceId, resultTypes: safeTypes }),
    [safeSourceType, safeSourceId, safeTypes]
  );

  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState({ sourceType: '', sourceId: '', modelAvailable: true, explanationVersion: 'v1' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestVersionRef = useRef(0);

  const run = useCallback(async ({ force = false } = {}) => {
    if (!enabled || !safeSourceType || !safeSourceId) {
      setResults([]);
      setMeta({ sourceType: safeSourceType, sourceId: safeSourceId, modelAvailable: true, explanationVersion: 'v1' });
      setLoading(false);
      setError('');
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setError('');

    if (!force) {
      const cached = readCache(cacheKey);
      if (cached) {
        setResults(Array.isArray(cached.results) ? cached.results : []);
        setMeta(cached.meta || { sourceType: safeSourceType, sourceId: safeSourceId, modelAvailable: true, explanationVersion: 'v1' });
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const data = await fetchSemanticRelated({
        sourceType: safeSourceType,
        sourceId: safeSourceId,
        limit,
        resultTypes: safeTypes
      });
      if (requestVersion !== requestVersionRef.current) return;
      const payload = {
        results: Array.isArray(data?.results) ? data.results : [],
        meta: data?.meta || { sourceType: safeSourceType, sourceId: safeSourceId, modelAvailable: true, explanationVersion: 'v1' }
      };
      writeCache(cacheKey, payload);
      setResults(payload.results);
      setMeta(payload.meta);
    } catch (err) {
      if (requestVersion !== requestVersionRef.current) return;
      setError(err?.response?.data?.error || 'Failed to load semantic related items.');
      setResults([]);
      setMeta({ sourceType: safeSourceType, sourceId: safeSourceId, modelAvailable: true, explanationVersion: 'v1' });
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [cacheKey, enabled, limit, safeSourceId, safeSourceType, safeTypes]);

  useEffect(() => {
    run({ force: false });
  }, [run]);

  return {
    results,
    meta,
    loading,
    error,
    refresh: () => run({ force: true })
  };
};

export default useSemanticRelated;
