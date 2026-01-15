import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from './useAuthHeaders';

/**
 * @typedef {Object} Highlight
 * @property {string} _id
 * @property {string} text
 * @property {string[]} tags
 * @property {string} [createdAt]
 * @property {string} [articleId]
 * @property {string} [articleTitle]
 * @property {Object} [anchor]
 */

const normalizeHighlight = (highlight, article) => ({
  ...highlight,
  tags: highlight.tags || [],
  articleId: highlight.articleId || article?._id,
  articleTitle: highlight.articleTitle || article?.title
});

const normalizeHighlights = (highlights = [], article) => (
  highlights.map(h => normalizeHighlight(h, article))
);

const useArticleDetail = (articleId, options = {}) => {
  const { enabled = true } = options;
  const [article, setArticle] = useState(null);
  const [highlights, setHighlights] = useState(/** @type {Highlight[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchArticle = useCallback(async () => {
    if (!articleId || !enabled) return;
    setLoading(true);
    setError('');
    try {
      const [articleRes, highlightRes] = await Promise.all([
        api.get(`/articles/${articleId}`, getAuthHeaders()),
        api.get(`/api/articles/${articleId}/highlights`, getAuthHeaders()).catch(() => ({ data: [] }))
      ]);
      const articleData = articleRes.data || null;
      const highlightData = highlightRes.data?.length ? highlightRes.data : (articleData?.highlights || []);
      setArticle(articleData);
      setHighlights(normalizeHighlights(highlightData, articleData));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load article.');
    } finally {
      setLoading(false);
    }
  }, [articleId, enabled]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  const addHighlightOptimistic = useCallback((highlight) => {
    setHighlights(prev => normalizeHighlights([...prev, highlight], article));
  }, [article]);

  const replaceHighlight = useCallback((tempId, highlight) => {
    setHighlights(prev => normalizeHighlights(
      prev.map(item => (item._id === tempId ? highlight : item)),
      article
    ));
  }, [article]);

  const removeHighlight = useCallback((id) => {
    setHighlights(prev => prev.filter(item => item._id !== id));
  }, []);

  return {
    article,
    highlights,
    loading,
    error,
    refresh: fetchArticle,
    addHighlightOptimistic,
    replaceHighlight,
    removeHighlight
  };
};

export default useArticleDetail;
