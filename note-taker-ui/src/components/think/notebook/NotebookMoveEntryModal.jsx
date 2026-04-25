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
    options.push({
      id: folder._id,
      name: folder.name,
      depth,
      parentFolderId: folder.parentFolderId || null
    });
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
  onCreateFolder = async () => null,
  loading = false,
  error = ''
}) => {
  const currentFolderId = normalizeId(entry?.folder);
  const [query, setQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(currentFolderId);
  const [createParentFolderId, setCreateParentFolderId] = useState(currentFolderId);
  const [createParentTouched, setCreateParentTouched] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedFolderId(currentFolderId);
    setCreateParentFolderId(currentFolderId);
    setCreateParentTouched(false);
    setCreatePending(false);
    setCreateError('');
  }, [currentFolderId, open]);

  const folderOptions = useMemo(() => flattenFolderOptions(folders), [folders]);
  const parentFolderOptions = useMemo(() => flattenFolderOptions(folders, 'Top level'), [folders]);
  const normalizedQuery = query.trim().toLowerCase();
  const effectiveCreateParentFolderId = createParentTouched
    ? normalizeId(createParentFolderId)
    : normalizeId(selectedFolderId);
  const exactMatch = useMemo(
    () => folderOptions.find((option) => (
      option.id
      && normalizeId(option.parentFolderId) === effectiveCreateParentFolderId
      && option.name.trim().toLowerCase() === normalizedQuery
    )) || null,
    [folderOptions, normalizedQuery, effectiveCreateParentFolderId]
  );
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return folderOptions;
    return folderOptions.filter((option) => option.name.toLowerCase().includes(normalizedQuery));
  }, [folderOptions, normalizedQuery]);

  if (!open || !entry) return null;

  const title = String(entry?.title || '').trim() || 'Untitled';
  const destinationChanged = normalizeId(selectedFolderId) !== currentFolderId;
  const showCreateRow = Boolean(normalizedQuery);
  const canCreateFolder = showCreateRow && !exactMatch;
  const modalError = createError || error;
  const busy = loading || createPending;
  const selectedParentOption = parentFolderOptions.find(
    (option) => normalizeId(option.id) === effectiveCreateParentFolderId
  ) || parentFolderOptions[0];

  const handleCreateAndMove = async () => {
    const candidate = query.trim();
    if (!candidate || !canCreateFolder) return;
    setCreatePending(true);
    setCreateError('');
    try {
      const created = await onCreateFolder(candidate, {
        parentFolderId: effectiveCreateParentFolderId || null
      });
      const createdFolderId = normalizeId(created?._id);
      if (!createdFolderId) {
        throw new Error('Folder was created without an id.');
      }
      setSelectedFolderId(createdFolderId);
      setCreateParentFolderId(createdFolderId);
      setCreateParentTouched(true);
      await onMove(createdFolderId);
    } catch (createFolderError) {
      setCreateError(createFolderError?.response?.data?.error || createFolderError?.message || 'Failed to create folder.');
    } finally {
      setCreatePending(false);
    }
  };

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
            onChange={(event) => {
              setQuery(event.target.value);
              if (createError) setCreateError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canCreateFolder) {
                event.preventDefault();
                handleCreateAndMove();
              }
            }}
            disabled={busy}
          />
        </label>

        {showCreateRow ? (
          <div className="notebook-move-entry-modal__create-row">
            <p className="notebook-move-entry-modal__create-copy">
              {effectiveCreateParentFolderId
                ? `Create “${query.trim()}” inside “${selectedParentOption?.name || 'Selected folder'}”, then move this note there.`
                : `Create “${query.trim()}” at top level, then move this note there.`}
            </p>
            <label className="feedback-field notebook-move-entry-modal__create-field">
              <span>Parent folder</span>
              <select
                value={effectiveCreateParentFolderId}
                onChange={(event) => {
                  setCreateParentFolderId(event.target.value);
                  setCreateParentTouched(true);
                }}
                disabled={busy}
              >
                {parentFolderOptions.map((option) => (
                  <option key={option.id || 'root'} value={option.id}>
                    {`${option.depth > 0 ? `${'  '.repeat(option.depth)}↳ ` : ''}${option.name}`}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              className="notebook-move-entry-modal__create-action"
              onClick={handleCreateAndMove}
              disabled={busy || !canCreateFolder}
              data-testid="notebook-move-entry-create-folder"
            >
              {createPending ? 'Creating…' : 'Create folder and move'}
            </Button>
            {exactMatch ? (
              <p className="muted small notebook-move-entry-modal__create-note">
                A folder with that name already exists in the selected parent.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="notebook-move-entry-modal__destinations" aria-label="Notebook move destinations">
          {filteredOptions.map((option) => {
            const isActive = normalizeId(selectedFolderId) === normalizeId(option.id);
            return (
              <QuietButton
                key={option.id || 'root'}
                className={`notebook-move-entry-modal__destination ${isActive ? 'is-active' : ''}`.trim()}
                onClick={() => {
                  setSelectedFolderId(option.id);
                  setCreateParentFolderId(option.id);
                  setCreateParentTouched(false);
                }}
                disabled={busy}
              >
                <span
                  className="notebook-move-entry-modal__destination-name"
                  style={{ paddingLeft: `${option.depth * 18}px` }}
                >
                  {option.name}
                </span>
                {isActive ? <span className="notebook-move-entry-modal__destination-state">Selected</span> : null}
              </QuietButton>
            );
          })}
          {filteredOptions.length === 0 ? (
            <p className="muted small notebook-move-entry-modal__empty">No folders match that search.</p>
          ) : null}
        </div>

        {modalError ? <p className="status-message error-message notebook-move-entry-modal__error">{modalError}</p> : null}

        <div className="modal-actions notebook-move-entry-modal__actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onMove(selectedFolderId || null)} disabled={busy || !destinationChanged}>
            {loading ? 'Moving…' : 'Move'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotebookMoveEntryModal;
