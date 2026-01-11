import { useCallback, useEffect, useState } from 'react';
import { getFolders } from '../api/folders';

/**
 * @typedef {Object} Folder
 * @property {string} _id
 * @property {string} name
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

const useFolders = () => {
  const [folders, setFolders] = useState(/** @type {Folder[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchFolders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getFolders();
      setFolders(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load folders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  return { folders, loading, error, refresh: fetchFolders };
};

export default useFolders;
