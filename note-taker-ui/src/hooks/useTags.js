import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from './useAuthHeaders';
import { fetchWithCache } from '../utils/cache';

/**
 * @typedef {Object} TagStat
 * @property {string} tag
 * @property {number} count
 */

const useTags = () => {
  const [tags, setTags] = useState(/** @type {TagStat[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWithCache('tags.list', async () => {
        const res = await api.get('/api/tags', getAuthHeaders());
        return res.data || [];
      });
      setTags(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tags.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  return { tags, loading, error, refresh: fetchTags };
};

export default useTags;
