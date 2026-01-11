import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from './useAuthHeaders';

const useNotebookEntries = ({ enabled = true } = {}) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchEntries = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/notebook', getAuthHeaders());
      setEntries(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load notebook entries.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return { entries, loading, error, refresh: fetchEntries };
};

export default useNotebookEntries;
