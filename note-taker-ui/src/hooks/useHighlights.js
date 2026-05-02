import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAllHighlights } from '../api/highlights';
import { endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';

/**
 * @typedef {Object} Highlight
 * @property {string} _id
 * @property {string} text
 * @property {string[]} [tags]
 * @property {'claim'|'evidence'|'note'} [type]
 * @property {string|null} [claimId]
 * @property {string} [articleId]
 * @property {string} [articleTitle]
 * @property {string} [createdAt]
 */

const useHighlights = ({ enabled = true } = {}) => {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHighlights = useCallback(async ({ force = false } = {}) => {
    if (!enabled) return;
    const startedAt = startPerfTimer();
    setLoading(true);
    setError('');
    try {
      const next = await getAllHighlights({ force });
      setHighlights(next);
      logPerf('think.highlights.load', {
        count: next.length,
        durationMs: endPerfTimer(startedAt)
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load highlights.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  const highlightMap = useMemo(() => {
    const map = new Map();
    highlights.forEach(h => {
      map.set(String(h._id), h);
    });
    return map;
  }, [highlights]);

  const refresh = useCallback(() => fetchHighlights({ force: true }), [fetchHighlights]);

  return { highlights, highlightMap, loading, error, refresh };
};

export default useHighlights;
