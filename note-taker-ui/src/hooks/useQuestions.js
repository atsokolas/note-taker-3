import { useCallback, useEffect, useState } from 'react';
import { getQuestions, getConceptQuestions } from '../api/questions';
import { endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';

/**
 * @param {{ status?: string, tag?: string, conceptName?: string, enabled?: boolean }} options
 */
const useQuestions = ({ status = 'open', tag = '', conceptName = '', enabled = true } = {}) => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchQuestions = useCallback(async () => {
    if (!enabled) return;
    const startedAt = startPerfTimer();
    setLoading(true);
    setError('');
    try {
      const data = conceptName
        ? await getConceptQuestions(conceptName, { status })
        : await getQuestions({ status, tag });
      const next = data || [];
      setQuestions(next);
      logPerf('think.questions.load', {
        mode: conceptName ? 'concept' : 'global',
        count: next.length,
        durationMs: endPerfTimer(startedAt)
      });
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
