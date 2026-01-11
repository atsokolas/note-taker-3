import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from './useAuthHeaders';

/**
 * @typedef {Object} NotebookBlockReference
 * @property {string} notebookEntryId
 * @property {string} notebookTitle
 * @property {string} [blockId]
 * @property {string} [blockPreviewText]
 * @property {string} [updatedAt]
 */

const useArticleReferences = (articleId, options = {}) => {
  const { enabled = true } = options;
  const [references, setReferences] = useState({ notebookBlocks: [], collections: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReferences = useCallback(async () => {
    if (!articleId || !enabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/references/for-article/${articleId}`, getAuthHeaders());
      setReferences(res.data || { notebookBlocks: [], collections: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load references.');
    } finally {
      setLoading(false);
    }
  }, [articleId, enabled]);

  useEffect(() => {
    fetchReferences();
  }, [fetchReferences]);

  return { references, loading, error, refresh: fetchReferences };
};

export default useArticleReferences;
