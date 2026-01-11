import { useCallback, useEffect, useState } from 'react';
import { getConcept } from '../api/concepts';

const useConcept = (name, options = {}) => {
  const { enabled = true } = options;
  const [concept, setConcept] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchConcept = useCallback(async () => {
    if (!enabled || !name) return;
    setLoading(true);
    setError('');
    try {
      const data = await getConcept(name);
      setConcept(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load concept.');
    } finally {
      setLoading(false);
    }
  }, [enabled, name]);

  useEffect(() => {
    fetchConcept();
  }, [fetchConcept]);

  return { concept, loading, error, refresh: fetchConcept, setConcept };
};

export default useConcept;
