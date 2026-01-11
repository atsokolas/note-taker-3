import { useCallback, useEffect, useState } from 'react';
import { getConceptRelated } from '../api/concepts';

const useConceptRelated = (name, options = {}) => {
  const { enabled = true, limit = 20, offset = 0 } = options;
  const [related, setRelated] = useState({ highlights: [], notes: [], articles: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRelated = useCallback(async () => {
    if (!enabled || !name) return;
    setLoading(true);
    setError('');
    try {
      const data = await getConceptRelated(name, { limit, offset });
      setRelated(data || { highlights: [], notes: [], articles: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load related data.');
    } finally {
      setLoading(false);
    }
  }, [enabled, name, limit, offset]);

  useEffect(() => {
    fetchRelated();
  }, [fetchRelated]);

  return { related, loading, error, refresh: fetchRelated };
};

export default useConceptRelated;
