import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getHighlights } from '../api/highlights';
import { endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';

const useHighlightsQuery = (filters = {}, options = {}) => {
  const { enabled = true, debounceMs = 0 } = options;
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestVersionRef = useRef(0);

  const serializedFilters = useMemo(
    () => JSON.stringify(filters || {}),
    [filters]
  );

  const fetchHighlights = useCallback(async () => {
    if (!enabled) return;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const startedAt = startPerfTimer();
    setLoading(true);
    setError('');
    try {
      const data = await getHighlights(filters);
      if (requestVersionRef.current !== requestVersion) return;
      const next = data || [];
      setHighlights(next);
      logPerf('library.highlights.load', {
        count: next.length,
        durationMs: endPerfTimer(startedAt)
      });
    } catch (err) {
      if (requestVersionRef.current !== requestVersion) return;
      setError(err.response?.data?.error || 'Failed to load highlights.');
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setLoading(false);
      }
    }
  }, [enabled, filters]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!debounceMs) {
      fetchHighlights();
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchHighlights();
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, enabled, fetchHighlights, serializedFilters]);

  return { highlights, loading, error, refresh: fetchHighlights, setHighlights };
};

export default useHighlightsQuery;
