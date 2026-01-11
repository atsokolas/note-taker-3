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
 */

const normalizeHighlights = (highlights = [], article) => (
  highlights.map(h => ({
    ...h,
    tags: h.tags || [],
    articleId: h.articleId || article?._id,
    articleTitle: h.articleTitle || article?.title
  }))
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

  return { article, highlights, loading, error, refresh: fetchArticle };
};

export default useArticleDetail;
