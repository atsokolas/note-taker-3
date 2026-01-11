import { useCallback, useEffect, useState } from 'react';
import { getReflections } from '../api/reflections';

/**
 * @param {string} range
 * @param {{ enabled?: boolean }} [options]
 */
const useReflections = (range, options = {}) => {
  const { enabled = true } = options;
  const [data, setData] = useState({
    rangeDays: 14,
    activeConcepts: [],
    notesInProgress: [],
    openQuestions: { groups: [] },
    deltaSummary: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReflections = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await getReflections(range);
      setData(res || {
        rangeDays: 14,
        activeConcepts: [],
        notesInProgress: [],
        openQuestions: { groups: [] },
        deltaSummary: []
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reflections.');
    } finally {
      setLoading(false);
    }
  }, [enabled, range]);

  useEffect(() => {
    fetchReflections();
  }, [fetchReflections]);

  return { data, loading, error, refresh: fetchReflections };
};

export default useReflections;
