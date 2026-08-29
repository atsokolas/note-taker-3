import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from './useAuthHeaders';
import { endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';
import { normalizeHighlights } from '../utils/highlightModel';

export const classifyArticleDetailError = (error) => {
  const status = Number(error?.response?.status || 0);
  if (status === 404) {
    return {
      kind: 'missing',
      message: 'This source is no longer available in your Library.'
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: 'unavailable',
      message: 'This source is not available to this account.'
    };
  }
  return {
    kind: 'failed',
    message: 'Library could not open this source.'
  };
};

const useArticleDetail = (articleId, options = {}) => {
  const { enabled = true } = options;
  const [article, setArticle] = useState(null);
  const [highlights, setHighlights] = useState(/** @type {Highlight[]} */ ([]));
  const [references, setReferences] = useState({ notebookBlocks: [], collections: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState('');
  const requestSequence = useRef(0);

  const fetchArticle = useCallback(async ({ clearCurrent = false } = {}) => {
    if (!articleId || !enabled) return;
    const requestId = ++requestSequence.current;
    const startedAt = startPerfTimer();
    if (clearCurrent) {
      setArticle(null);
      setHighlights([]);
      setReferences({ notebookBlocks: [], collections: [] });
    }
    setLoading(true);
    setError('');
    setErrorKind('');
    try {
      const [articleRes, highlightRes, referenceRes] = await Promise.all([
        api.get(`/articles/${articleId}`, getAuthHeaders()),
        api.get(`/api/articles/${articleId}/highlights`, getAuthHeaders()).catch(() => ({ data: [] })),
        api.get(`/api/articles/${articleId}/backlinks`, getAuthHeaders()).catch(() => ({ data: { notebookBlocks: [], collections: [] } }))
      ]);
      const articleData = articleRes.data || null;
      if (!articleData) {
        const missing = new Error('Article response was empty.');
        missing.response = { status: 404 };
        throw missing;
      }
      if (requestSequence.current !== requestId) return;
      const highlightData = highlightRes.data?.length ? highlightRes.data : (articleData?.highlights || []);
      const referenceData = referenceRes.data || { notebookBlocks: [], collections: [] };
      setArticle(articleData);
      setHighlights(normalizeHighlights(highlightData, articleData));
      setReferences(referenceData);
      logPerf('library.article.detail.load', {
        articleId,
        highlights: highlightData.length,
        references: referenceData.notebookBlocks?.length || 0,
        durationMs: endPerfTimer(startedAt)
      });
    } catch (err) {
      if (requestSequence.current !== requestId) return;
      const failure = classifyArticleDetailError(err);
      setError(failure.message);
      setErrorKind(failure.kind);
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [articleId, enabled]);

  useEffect(() => {
    if (!articleId || !enabled) {
      requestSequence.current += 1;
      setArticle(null);
      setHighlights([]);
      setReferences({ notebookBlocks: [], collections: [] });
      setLoading(false);
      setError('');
      setErrorKind('');
      return;
    }
    fetchArticle({ clearCurrent: true });
  }, [articleId, enabled, fetchArticle]);

  const retry = useCallback(() => fetchArticle({ clearCurrent: false }), [fetchArticle]);

  const addHighlightOptimistic = useCallback((highlight) => {
    setHighlights(prev => normalizeHighlights([...prev, highlight], article));
  }, [article]);

  const replaceHighlight = useCallback((tempId, highlight) => {
    setHighlights(prev => normalizeHighlights(
      prev.map(item => (item._id === tempId ? { ...item, ...highlight } : item)),
      article
    ));
  }, [article]);

  const removeHighlight = useCallback((id) => {
    setHighlights(prev => prev.filter(item => item._id !== id));
  }, []);

  return {
    article,
    highlights,
    references,
    loading,
    error,
    errorKind,
    refresh: retry,
    addHighlightOptimistic,
    replaceHighlight,
    removeHighlight
  };
};

export default useArticleDetail;
