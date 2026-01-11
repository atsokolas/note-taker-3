import { useCallback, useEffect, useMemo, useState } from 'react';
import { getArticles } from '../api/articles';

/**
 * @typedef {Object} LibraryArticlesParams
 * @property {'all'|'unfiled'|'folder'} scope
 * @property {string} [folderId]
 * @property {string} [query]
 * @property {'recent'|'oldest'|'most-highlighted'} [sort]
 */

const useLibraryArticles = ({ scope, folderId, query = '', sort = 'recent' }) => {
  const [allArticles, setAllArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getArticles({ scope: 'all' });
      setAllArticles(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load articles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const articles = useMemo(() => {
    let next = allArticles;
    if (scope === 'folder' && !folderId) {
      next = [];
    } else if (scope === 'unfiled') {
      next = next.filter(article => !article.folder);
    } else if (scope === 'folder' && folderId) {
      next = next.filter(article => article.folder?._id === folderId);
    }
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      next = next.filter(article =>
        `${article.title || ''} ${article.url || ''}`.toLowerCase().includes(normalizedQuery)
      );
    }
    if (sort === 'oldest') {
      next = [...next].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sort === 'most-highlighted') {
      next = [...next].sort((a, b) => (b.highlights?.length || 0) - (a.highlights?.length || 0));
    } else {
      next = [...next].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return next;
  }, [allArticles, scope, folderId, query, sort]);

  return { articles, allArticles, loading, error, refresh: fetchArticles };
};

export default useLibraryArticles;
