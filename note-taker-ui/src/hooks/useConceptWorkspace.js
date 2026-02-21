import { useCallback, useEffect, useState } from 'react';
import {
  getConceptWorkspace,
  patchConceptWorkspace,
  replaceConceptWorkspace
} from '../api/concepts';

const defaultWorkspace = () => ({
  version: 1,
  groups: [
    {
      id: 'default-workspace',
      title: 'Workspace',
      description: '',
      collapsed: false,
      order: 0
    }
  ],
  items: [],
  updatedAt: new Date().toISOString()
});

const useConceptWorkspace = (conceptId, options = {}) => {
  const { enabled = true } = options;
  const [workspace, setWorkspace] = useState(() => defaultWorkspace());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchWorkspace = useCallback(async () => {
    if (!enabled || !conceptId) return;
    setLoading(true);
    setError('');
    try {
      const response = await getConceptWorkspace(conceptId);
      setWorkspace(response?.workspace || defaultWorkspace());
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load workspace.');
    } finally {
      setLoading(false);
    }
  }, [conceptId, enabled]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const saveWorkspace = useCallback(async (nextWorkspace) => {
    if (!conceptId) return null;
    setSaving(true);
    setError('');
    try {
      const response = await replaceConceptWorkspace(conceptId, nextWorkspace);
      const saved = response?.workspace || nextWorkspace;
      setWorkspace(saved);
      return saved;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save workspace.');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [conceptId]);

  const patchWorkspace = useCallback(async (op, payload = {}, optionsInput = {}) => {
    if (!conceptId) return null;
    const { optimisticWorkspace = null } = optionsInput;
    const previous = workspace;
    if (optimisticWorkspace) {
      setWorkspace(optimisticWorkspace);
    }
    setSaving(true);
    setError('');
    try {
      const response = await patchConceptWorkspace(conceptId, op, payload);
      const saved = response?.workspace || optimisticWorkspace || previous;
      setWorkspace(saved);
      return saved;
    } catch (err) {
      if (optimisticWorkspace) {
        setWorkspace(previous);
      }
      setError(err.response?.data?.error || 'Failed to update workspace.');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [conceptId, workspace]);

  return {
    workspace,
    loading,
    saving,
    error,
    refresh: fetchWorkspace,
    setWorkspace,
    saveWorkspace,
    patchWorkspace
  };
};

export default useConceptWorkspace;
