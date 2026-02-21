import { useCallback, useEffect, useState } from 'react';
import { getConceptMaterial } from '../api/concepts';

const EMPTY_MATERIAL = {
  pinnedHighlights: [],
  recentHighlights: [],
  linkedArticles: []
};

const useConceptMaterial = (conceptId, options = {}) => {
  const { enabled = true } = options;
  const [material, setMaterial] = useState(EMPTY_MATERIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchMaterial = useCallback(async () => {
    if (!enabled || !conceptId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getConceptMaterial(conceptId);
      setMaterial({
        pinnedHighlights: Array.isArray(data?.pinnedHighlights) ? data.pinnedHighlights : [],
        recentHighlights: Array.isArray(data?.recentHighlights) ? data.recentHighlights : [],
        linkedArticles: Array.isArray(data?.linkedArticles) ? data.linkedArticles : []
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load concept material.');
    } finally {
      setLoading(false);
    }
  }, [conceptId, enabled]);

  useEffect(() => {
    fetchMaterial();
  }, [fetchMaterial]);

  return {
    material,
    loading,
    error,
    refresh: fetchMaterial,
    setMaterial
  };
};

export default useConceptMaterial;
