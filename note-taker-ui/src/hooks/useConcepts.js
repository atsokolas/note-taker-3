import { useCallback, useEffect, useState } from 'react';
import { getConcepts } from '../api/concepts';

/**
 * @typedef {Object} Concept
 * @property {string} name
 * @property {string} description
 * @property {number} [count]
 */

const useConcepts = () => {
  const [concepts, setConcepts] = useState(/** @type {Concept[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchConcepts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getConcepts();
      setConcepts(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load concepts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConcepts();
  }, [fetchConcepts]);

  return { concepts, loading, error, refresh: fetchConcepts };
};

export default useConcepts;
