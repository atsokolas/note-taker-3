import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from './useAuthHeaders';

/**
 * @typedef {Object} Highlight
 * @property {string} _id
 * @property {string} text
 * @property {string[]} [tags]
 * @property {string} [articleId]
 * @property {string} [articleTitle]
 * @property {string} [createdAt]
 */

const useHighlights = ({ enabled = true } = {}) => {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHighlights = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/highlights/all', getAuthHeaders());
      setHighlights(res.data || []);
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

  return { highlights, highlightMap, loading, error, refresh: fetchHighlights };
};

export default useHighlights;
