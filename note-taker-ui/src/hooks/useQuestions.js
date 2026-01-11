import { useCallback, useEffect, useState } from 'react';
import { getQuestions, getConceptQuestions } from '../api/questions';

/**
 * @param {{ status?: string, tag?: string, conceptName?: string, enabled?: boolean }} options
 */
const useQuestions = ({ status = 'open', tag = '', conceptName = '', enabled = true } = {}) => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchQuestions = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const data = conceptName
        ? await getConceptQuestions(conceptName, { status })
        : await getQuestions({ status, tag });
      setQuestions(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load questions.');
    } finally {
      setLoading(false);
    }
  }, [conceptName, enabled, status, tag]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  return { questions, loading, error, refresh: fetchQuestions, setQuestions };
};

export default useQuestions;
