import { useCallback, useEffect, useMemo, useState } from 'react';
import { getArticles } from '../api/articles';
import { endPerfTimer, logPerf, startPerfTimer } from '../utils/perf';

/**
 * @typedef {Object} LibraryArticlesParams
 * @property {'all'|'unfiled'|'folder'} scope
 * @property {string} [folderId]
 * @property {string} [query]
 * @property {'recent'|'oldest'|'most-highlighted'} [sort]
 * @property {boolean} [includeSuppressed]
 */

const useLibraryArticles = ({ scope, folderId, query = '', sort = 'recent', includeSuppressed = false }) => {
  const [allArticles, setAllArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchArticles = useCallback(async () => {
    const startedAt = startPerfTimer();
    setLoading(true);
    setError('');
    try {
      const data = await getArticles({ scope: 'all', includeSuppressed });
      const next = data || [];
      setAllArticles(next);
      logPerf('library.list.load', {
        count: next.length,
        durationMs: endPerfTimer(startedAt)
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load articles.');
    } finally {
      setLoading(false);
    }
  }, [includeSuppressed]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const articles = useMemo(() => {
    const getHighlightCount = (article) => Number(article?.highlightCount ?? article?.highlights?.length ?? 0);
    const searchableArticleText = (article = {}) => [
      article.title,
      article.url,
      article.source,
      article.publication,
      article.publisher,
      article.siteName,
      article.summary,
      article.description,
      article.excerpt,
      article.previewText,
      article.snippet,
      ...(Array.isArray(article.tags) ? article.tags : []),
      ...(Array.isArray(article.concepts)
        ? article.concepts.map(item => item?.name || item?.tag || item)
        : [])
    ].filter(Boolean).join(' ').toLowerCase();
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
      const terms = normalizedQuery.split(/\s+/).filter(Boolean);
      next = next.filter(article => {
        const haystack = searchableArticleText(article);
        return terms.every(term => haystack.includes(term));
      });
    }
    if (sort === 'oldest') {
      next = [...next].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sort === 'most-highlighted') {
      next = [...next].sort((a, b) => getHighlightCount(b) - getHighlightCount(a));
    } else {
      next = [...next].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return next;
  }, [allArticles, scope, folderId, query, sort]);

  return { articles, allArticles, loading, error, refresh: fetchArticles, setAllArticles };
};

export default useLibraryArticles;
