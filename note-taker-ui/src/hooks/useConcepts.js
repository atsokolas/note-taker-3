import { useCallback, useEffect, useState } from 'react';
import { getConcepts } from '../api/concepts';
import { endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';

/**
 * @typedef {Object} Concept
 * @property {string} name
 * @property {string} description
 * @property {number} [count]
 */

const useConcepts = ({ enabled = true } = {}) => {
  const [concepts, setConcepts] = useState(/** @type {Concept[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchConcepts = useCallback(async ({ force = false } = {}) => {
    if (!enabled) return;
    const startedAt = startPerfTimer();
    setLoading(true);
    setError('');
    try {
      const data = await getConcepts({ force });
      const next = data || [];
      setConcepts(next);
      logPerf('think.concepts.load', {
        count: next.length,
        durationMs: endPerfTimer(startedAt)
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load concepts.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchConcepts();
  }, [fetchConcepts]);

  const refresh = useCallback(() => fetchConcepts({ force: true }), [fetchConcepts]);

  return { concepts, loading, error, refresh };
};

export default useConcepts;
