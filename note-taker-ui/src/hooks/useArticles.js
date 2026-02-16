import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getArticles } from '../api/articles';

const resolveScope = (folderId) => {
  if (!folderId) return { scope: 'all', folderId: '' };
  if (folderId === 'unfiled') return { scope: 'unfiled', folderId: '' };
  return { scope: 'folder', folderId };
};

const useArticles = ({ query = '', folderId = '', enabled = true, debounceMs = 0 } = {}) => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestVersionRef = useRef(0);
  const serializedParams = useMemo(
    () => JSON.stringify({ query, folderId }),
    [folderId, query]
  );

  const fetchArticles = useCallback(async () => {
    if (!enabled) return;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setLoading(true);
    setError('');
    try {
      const { scope, folderId: resolvedFolder } = resolveScope(folderId);
      const data = await getArticles({ scope, folderId: resolvedFolder, query, sort: 'recent' });
      if (requestVersionRef.current !== requestVersion) return;
      setArticles(data || []);
    } catch (err) {
      if (requestVersionRef.current !== requestVersion) return;
      setError(err.response?.data?.error || 'Failed to load articles.');
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setLoading(false);
      }
    }
  }, [enabled, folderId, query]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!debounceMs) {
      fetchArticles();
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchArticles();
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, enabled, fetchArticles, serializedParams]);

  return { articles, loading, error, refresh: fetchArticles };
};

export default useArticles;
