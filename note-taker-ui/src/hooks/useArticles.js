import { useCallback, useEffect, useState } from 'react';
import { getArticles } from '../api/articles';

const resolveScope = (folderId) => {
  if (!folderId) return { scope: 'all', folderId: '' };
  if (folderId === 'unfiled') return { scope: 'unfiled', folderId: '' };
  return { scope: 'folder', folderId };
};

const useArticles = ({ query = '', folderId = '', enabled = true } = {}) => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchArticles = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const { scope, folderId: resolvedFolder } = resolveScope(folderId);
      const data = await getArticles({ scope, folderId: resolvedFolder, query, sort: 'recent' });
      setArticles(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load articles.');
    } finally {
      setLoading(false);
    }
  }, [enabled, folderId, query]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  return { articles, loading, error, refresh: fetchArticles };
};

export default useArticles;
