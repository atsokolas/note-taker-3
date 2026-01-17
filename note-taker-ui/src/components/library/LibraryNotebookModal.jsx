import React, { useEffect, useMemo, useState } from 'react';
import { Button, QuietButton } from '../ui';
import useNotebookEntries from '../../hooks/useNotebookEntries';
import api from '../../api';

const LibraryNotebookModal = ({ open, highlight, onClose, onSend }) => {
  const { entries, loading, error } = useNotebookEntries({ enabled: open });
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId('');
    setQuery('');
  }, [open]);

  if (!open) return null;

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(entry => (entry.title || '').toLowerCase().includes(q));
  }, [entries, query]);

  const handleCreate = async () => {
    const title = query.trim() || 'Untitled note';
    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await api.post('/api/notebook', { title, content: '', blocks: [] }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?._id) {
        onSend(highlight, res.data._id);
      }
    } catch (err) {
      console.error('Error creating notebook entry:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>Send to Notebook</h3>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        {loading && <p className="muted small">Loading notebook…</p>}
        {error && <p className="status-message error-message">{error}</p>}
        {!loading && entries.length === 0 && (
          <p className="muted small">No notebook entries yet.</p>
        )}
        <label className="feedback-field">
          <span>Search or name a new entry</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notebook..."
          />
        </label>
        <div className="library-folder-picker">
          {filteredEntries.map(entry => (
            <QuietButton
              key={entry._id}
              className={selectedId === entry._id ? 'is-active' : ''}
              onClick={() => setSelectedId(entry._id)}
            >
              {entry.title || 'Untitled note'}
            </QuietButton>
          ))}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={handleCreate} disabled={creating || !query.trim()}>
            {creating ? 'Creating…' : 'Create new'}
          </Button>
          <Button onClick={() => onSend(highlight, selectedId)} disabled={!selectedId}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LibraryNotebookModal;
