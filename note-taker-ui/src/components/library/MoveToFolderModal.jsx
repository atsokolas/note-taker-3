import React, { useEffect, useMemo, useState } from 'react';
import { Button, QuietButton } from '../ui';

/**
 * @param {{
 *  open: boolean,
 *  folders: Array<{ _id: string, name: string }>,
 *  currentFolderId?: string,
 *  onClose: () => void,
 *  onMove: (folderId: string | null) => void,
 *  loading?: boolean,
 *  error?: string
 * }} props
 */
const MoveToFolderModal = ({
  open,
  folders,
  currentFolderId,
  onClose,
  onMove,
  loading,
  error
}) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(currentFolderId || '');

  useEffect(() => {
    if (!open) return;
    setSelectedFolderId(currentFolderId || '');
    setQuery('');
    setDebouncedQuery('');
  }, [open, currentFolderId]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200);
    return () => clearTimeout(handle);
  }, [query]);

  const filtered = useMemo(() => {
    if (!debouncedQuery) return folders;
    return folders.filter(folder => folder.name.toLowerCase().includes(debouncedQuery));
  }, [folders, debouncedQuery]);

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3>Move to Folder</h3>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <label className="feedback-field">
          <span>Search folders</span>
          <input
            type="text"
            value={query}
            placeholder="Start typing a folder name…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="library-folder-picker">
          <QuietButton
            className={selectedFolderId === '' ? 'is-active' : ''}
            onClick={() => setSelectedFolderId('')}
          >
            Unfile
          </QuietButton>
          {filtered.map(folder => (
            <QuietButton
              key={folder._id}
              className={selectedFolderId === folder._id ? 'is-active' : ''}
              onClick={() => setSelectedFolderId(folder._id)}
            >
              {folder.name}
            </QuietButton>
          ))}
          {filtered.length === 0 && (
            <p className="muted small">No folders match that search.</p>
          )}
        </div>
        {error && <p className="status-message error-message">{error}</p>}
        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onMove(selectedFolderId || null)} disabled={loading}>
            {loading ? 'Moving…' : 'Move'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MoveToFolderModal;
