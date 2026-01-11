import { useCallback, useEffect, useState } from 'react';
import { getHighlights } from '../api/highlights';

const useHighlightsQuery = (filters = {}, options = {}) => {
  const { enabled = true } = options;
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHighlights = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const data = await getHighlights(filters);
      setHighlights(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load highlights.');
    } finally {
      setLoading(false);
    }
  }, [enabled, filters]);

  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  return { highlights, loading, error, refresh: fetchHighlights, setHighlights };
};

export default useHighlightsQuery;
