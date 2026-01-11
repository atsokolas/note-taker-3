import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from './useAuthHeaders';

const useConceptReferences = (name, options = {}) => {
  const { enabled = true } = options;
  const [references, setReferences] = useState({ notebookBlocks: [], collections: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReferences = useCallback(async () => {
    if (!enabled || !name) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/references/for-concept/${encodeURIComponent(name)}`, getAuthHeaders());
      setReferences(res.data || { notebookBlocks: [], collections: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load references.');
    } finally {
      setLoading(false);
    }
  }, [enabled, name]);

  useEffect(() => {
    fetchReferences();
  }, [fetchReferences]);

  return { references, loading, error, refresh: fetchReferences };
};

export default useConceptReferences;
