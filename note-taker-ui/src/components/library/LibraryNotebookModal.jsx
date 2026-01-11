import React, { useEffect, useState } from 'react';
import { Button, QuietButton } from '../ui';
import useNotebookEntries from '../../hooks/useNotebookEntries';

const LibraryNotebookModal = ({ open, highlight, onClose, onSend }) => {
  const { entries, loading, error } = useNotebookEntries({ enabled: open });
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedId('');
  }, [open]);

  if (!open) return null;

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
        <div className="library-folder-picker">
          {entries.map(entry => (
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
          <Button onClick={() => onSend(highlight, selectedId)} disabled={!selectedId}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LibraryNotebookModal;
