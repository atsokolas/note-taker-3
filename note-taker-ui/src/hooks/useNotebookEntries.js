import { useCallback, useEffect, useState } from 'react';
import { getNotebookSummaries } from '../api/notebook';

const useNotebookEntries = ({ enabled = true } = {}) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchEntries = useCallback(async ({ force = false } = {}) => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const data = await getNotebookSummaries({ force });
      setEntries(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load notebook entries.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const refresh = useCallback(() => fetchEntries({ force: true }), [fetchEntries]);

  return { entries, loading, error, refresh };
};

export default useNotebookEntries;
