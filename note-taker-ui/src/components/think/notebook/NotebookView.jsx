import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../api';
import { getAuthHeaders } from '../../../hooks/useAuthHeaders';
import NotebookList from './NotebookList';
import NotebookEditor from './NotebookEditor';

const NotebookView = ({ onActiveEntryChange }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const entryIdParam = searchParams.get('entryId') || '';
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [activeEntry, setActiveEntry] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [entryError, setEntryError] = useState('');

  const loadEntries = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const res = await api.get('/api/notebook', getAuthHeaders());
      const data = res.data || [];
      setEntries(data);
      if (data.length === 0) {
        setActiveId('');
        setActiveEntry(null);
      } else if (entryIdParam && data.some(entry => entry._id === entryIdParam)) {
        setActiveId(entryIdParam);
      } else if (!entryIdParam) {
        setActiveId(data[0]._id);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load notebook.');
    } finally {
      setLoadingList(false);
    }
  }, [entryIdParam]);

  const loadEntry = useCallback(async (entryId) => {
    if (!entryId) return;
    setLoadingEntry(true);
    setEntryError('');
    try {
      const res = await api.get(`/api/notebook/${entryId}`, getAuthHeaders());
      const entry = res.data || null;
      setActiveEntry(entry);
      if (onActiveEntryChange) onActiveEntryChange(entry);
    } catch (err) {
      setEntryError(err.response?.data?.error || 'Failed to load note.');
      setActiveEntry(null);
      if (onActiveEntryChange) onActiveEntryChange(null);
    } finally {
      setLoadingEntry(false);
    }
  }, [onActiveEntryChange]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!activeId) return;
    loadEntry(activeId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', 'notebook');
    nextParams.set('entryId', activeId);
    setSearchParams(nextParams, { replace: true });
  }, [activeId, loadEntry, searchParams, setSearchParams]);

  const handleSelect = (id) => {
    setActiveId(id);
  };

  const handleCreate = async () => {
    setSaving(true);
    setEntryError('');
    try {
      const res = await api.post('/api/notebook', { title: 'Untitled', content: '', blocks: [] }, getAuthHeaders());
      const created = res.data;
      setEntries(prev => [created, ...prev]);
      setActiveId(created._id);
      setActiveEntry(created);
      if (onActiveEntryChange) onActiveEntryChange(created);
    } catch (err) {
      setEntryError(err.response?.data?.error || 'Failed to create note.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (payload) => {
    if (!payload?.id) return;
    setSaving(true);
    setEntryError('');
    try {
      const res = await api.put(`/api/notebook/${payload.id}`, payload, getAuthHeaders());
      const updated = res.data;
      setEntries(prev => prev.map(entry => entry._id === updated._id ? updated : entry));
      setActiveEntry(updated);
      if (onActiveEntryChange) onActiveEntryChange(updated);
    } catch (err) {
      setEntryError(err.response?.data?.error || 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry) => {
    if (!entry?._id) return;
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setSaving(true);
    setEntryError('');
    try {
      await api.delete(`/api/notebook/${entry._id}`, getAuthHeaders());
      setEntries(prev => {
        const remaining = prev.filter(item => item._id !== entry._id);
        if (remaining.length > 0) {
          setActiveId(remaining[0]._id);
        } else {
          setActiveId('');
          setActiveEntry(null);
          if (onActiveEntryChange) onActiveEntryChange(null);
        }
        return remaining;
      });
    } catch (err) {
      setEntryError(err.response?.data?.error || 'Failed to delete note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="think-notebook-layout">
      <NotebookList
        entries={entries}
        activeId={activeId}
        loading={loadingList}
        error={error}
        onSelect={handleSelect}
        onCreate={handleCreate}
      />
      <div className="think-notebook-editor-pane">
        {loadingEntry && <p className="muted small">Loading note…</p>}
        {!loadingEntry && (
          <NotebookEditor
            entry={activeEntry}
            saving={saving}
            error={entryError}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
};

export default NotebookView;
