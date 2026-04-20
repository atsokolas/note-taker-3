import React, { useEffect, useMemo, useState } from 'react';
import { Button, QuietButton } from '../../ui';

const ROOT_TARGET_LABEL = 'Loose pages';

const normalizeId = (value) => {
  if (!value) return '';
  if (typeof value === 'object') {
    return String(value._id || value.id || '').trim();
  }
  return String(value).trim();
};

const compareFolders = (left, right) => {
  const leftOrder = Number.isFinite(Number(left?.sortOrder)) ? Number(left.sortOrder) : 0;
  const rightOrder = Number.isFinite(Number(right?.sortOrder)) ? Number(right.sortOrder) : 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return String(left?.name || '').localeCompare(String(right?.name || ''));
};

const flattenFolderOptions = (folders = []) => {
  const folderMap = new Map();
  folders.forEach((folder) => {
    const id = normalizeId(folder?._id);
    if (!id) return;
    folderMap.set(id, {
      ...folder,
      _id: id,
      parentFolderId: normalizeId(folder?.parentFolderId) || null,
      children: []
    });
  });

  folderMap.forEach((folder) => {
    if (!folder.parentFolderId) return;
    const parent = folderMap.get(folder.parentFolderId);
    if (parent) parent.children.push(folder);
  });

  folderMap.forEach((folder) => {
    folder.children.sort(compareFolders);
  });

  const roots = [...folderMap.values()]
    .filter((folder) => !folder.parentFolderId || !folderMap.has(folder.parentFolderId))
    .sort(compareFolders);

  const options = [{ id: '', name: ROOT_TARGET_LABEL, depth: 0 }];
  const visit = (folder, depth) => {
    options.push({ id: folder._id, name: folder.name, depth });
    folder.children.forEach((child) => visit(child, depth + 1));
  };
  roots.forEach((folder) => visit(folder, 0));
  return options;
};

const NotebookMoveEntryModal = ({
  open = false,
  entry = null,
  folders = [],
  onClose = () => {},
  onMove = () => {},
  loading = false,
  error = ''
}) => {
  const currentFolderId = normalizeId(entry?.folder);
  const [query, setQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(currentFolderId);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedFolderId(currentFolderId);
  }, [currentFolderId, open]);

  const folderOptions = useMemo(() => flattenFolderOptions(folders), [folders]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return folderOptions;
    return folderOptions.filter((option) => option.name.toLowerCase().includes(normalizedQuery));
  }, [folderOptions, normalizedQuery]);

  if (!open || !entry) return null;

  const title = String(entry?.title || '').trim() || 'Untitled';
  const destinationChanged = normalizeId(selectedFolderId) !== currentFolderId;

  return (
    <div className="modal-overlay">
      <div
        className="modal-content notebook-move-entry-modal"
        style={{ maxWidth: 520 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notebook-move-entry-modal-title"
      >
        <div className="modal-header notebook-move-entry-modal__header">
          <div>
            <p className="notebook-move-entry-modal__eyebrow">Move note</p>
            <h3 id="notebook-move-entry-modal-title">Choose a destination for “{title}”</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close move note modal">
            ×
          </button>
        </div>

        <label className="feedback-field notebook-move-entry-modal__search">
          <span>Find a folder</span>
          <input
            type="text"
            value={query}
            placeholder="Search folders…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="notebook-move-entry-modal__destinations" aria-label="Notebook move destinations">
          {filteredOptions.map((option) => {
            const isActive = normalizeId(selectedFolderId) === normalizeId(option.id);
            return (
              <QuietButton
                key={option.id || 'root'}
                className={`notebook-move-entry-modal__destination ${isActive ? 'is-active' : ''}`.trim()}
                onClick={() => setSelectedFolderId(option.id)}
              >
                <span
                  className="notebook-move-entry-modal__destination-name"
                  style={{ paddingLeft: `${option.depth * 18}px` }}
                >
                  {option.name}
                </span>
                {isActive ? <span className="notebook-move-entry-modal__destination-state">Current</span> : null}
              </QuietButton>
            );
          })}
          {filteredOptions.length === 0 ? (
            <p className="muted small notebook-move-entry-modal__empty">No folders match that search.</p>
          ) : null}
        </div>

        {error ? <p className="status-message error-message notebook-move-entry-modal__error">{error}</p> : null}

        <div className="modal-actions notebook-move-entry-modal__actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={() => onMove(selectedFolderId || null)} disabled={loading || !destinationChanged}>
            {loading ? 'Moving…' : 'Move'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotebookMoveEntryModal;
