import React, { useEffect, useMemo, useState } from 'react';
import FolderRow from '../../library/FolderRow';

const STORAGE_KEY = 'think.notebook.folderTree.open';
const ROOT_SECTION_LABEL = 'Loose pages';
const DRAG_DATA_KEY = 'application/x-noeis-notebook-entry-id';

const readOpenState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
};

const writeOpenState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // Ignore storage failures and keep the tree usable.
  }
};

const normalizeId = (value) => {
  if (!value) return '';
  if (typeof value === 'object') {
    return String(value._id || value.id || '').trim();
  }
  return String(value).trim();
};

const formatEntryDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
};

const compareFolders = (left, right) => {
  const leftOrder = Number.isFinite(Number(left?.sortOrder)) ? Number(left.sortOrder) : 0;
  const rightOrder = Number.isFinite(Number(right?.sortOrder)) ? Number(right.sortOrder) : 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return String(left?.name || '').localeCompare(String(right?.name || ''));
};

const buildFolderTree = (folders = [], entries = []) => {
  const folderMap = new Map();
  folders.forEach((folder) => {
    const id = normalizeId(folder?._id);
    if (!id) return;
    folderMap.set(id, {
      ...folder,
      _id: id,
      parentFolderId: normalizeId(folder?.parentFolderId) || null,
      children: [],
      entries: []
    });
  });

  const rootEntries = [];

  entries.forEach((entry) => {
    const folderId = normalizeId(entry?.folder);
    const node = folderId ? folderMap.get(folderId) : null;
    if (!node) {
      rootEntries.push(entry);
      return;
    }
    node.entries.push(entry);
  });

  const allNodes = new Map();
  folderMap.forEach((node, id) => {
    allNodes.set(id, { ...node, children: [...node.children], entries: [...node.entries] });
  });

  allNodes.forEach((node) => {
    if (!node.parentFolderId) return;
    const parent = allNodes.get(node.parentFolderId);
    if (parent) {
      parent.children.push(node);
    }
  });

  allNodes.forEach((node) => {
    node.children.sort(compareFolders);
  });

  const roots = [...allNodes.values()]
    .filter((node) => !node.parentFolderId || !allNodes.has(node.parentFolderId))
    .sort(compareFolders);

  return { roots, rootEntries };
};

const countVisibleEntries = (node) => (
  (node?.entries?.length || 0)
  + (node?.children || []).reduce((total, child) => total + countVisibleEntries(child), 0)
);

const collectFolderAncestors = (folders = [], activeEntryId = '', entries = []) => {
  const activeEntry = entries.find((entry) => normalizeId(entry?._id) === normalizeId(activeEntryId));
  const activeFolderId = normalizeId(activeEntry?.folder);
  if (!activeFolderId) return new Set();

  const parentMap = new Map(
    folders
      .map((folder) => [normalizeId(folder?._id), normalizeId(folder?.parentFolderId) || null])
      .filter(([id]) => id)
  );

  const ancestors = new Set();
  let currentId = activeFolderId;
  while (currentId) {
    ancestors.add(currentId);
    currentId = parentMap.get(currentId) || '';
  }
  return ancestors;
};

const NotebookEntryRow = ({
  entry,
  depth = 0,
  isActive = false,
  isDragging = false,
  moving = false,
  onSelectEntry = () => {},
  onRequestMoveEntry = null,
  onDragStart = null,
  onDragEnd = null
}) => {
  const entryId = normalizeId(entry?._id);
  const title = String(entry?.title || '').trim() || 'Untitled';
  const dateLabel = formatEntryDate(entry?.updatedAt || entry?.createdAt);
  return (
    <div className={`notebook-folder-tree__entry-row ${isDragging ? 'is-dragging' : ''}`.trim()}>
      <button
        type="button"
        className={`notebook-folder-tree__entry ${isActive ? 'is-active' : ''}`.trim()}
        style={{ paddingLeft: `${24 + depth * 14}px` }}
        onClick={() => onSelectEntry(entryId)}
        aria-current={isActive ? 'page' : undefined}
        draggable={!moving}
        onDragStart={onDragStart ? (event) => onDragStart(entry, event) : undefined}
        onDragEnd={onDragEnd || undefined}
        data-testid={entryId ? `notebook-entry-select-${entryId}` : undefined}
      >
        <span className="notebook-folder-tree__entry-title">{title}</span>
        {dateLabel ? <span className="notebook-folder-tree__entry-meta">{dateLabel}</span> : null}
      </button>
      {onRequestMoveEntry ? (
        <button
          type="button"
          className="notebook-folder-tree__entry-move"
          onClick={() => onRequestMoveEntry(entry)}
          aria-label={`Move ${title}`}
          disabled={moving}
        >
          Move
        </button>
      ) : null}
    </div>
  );
};

const NotebookFolderTree = ({
  folders = [],
  entries = [],
  activeEntryId = '',
  emptyMessage = 'No notebook entries yet.',
  movingEntryId = '',
  onSelectEntry = () => {},
  onRequestMoveEntry = null,
  onMoveEntry = () => {}
}) => {
  const [openState, setOpenState] = useState(readOpenState);
  const [draggedEntryId, setDraggedEntryId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const { roots, rootEntries } = useMemo(() => buildFolderTree(folders, entries), [folders, entries]);
  const activeFolderAncestors = useMemo(
    () => collectFolderAncestors(folders, activeEntryId, entries),
    [folders, activeEntryId, entries]
  );
  const entryMap = useMemo(() => new Map(
    entries.map((entry) => [normalizeId(entry?._id), entry]).filter(([id]) => id)
  ), [entries]);
  const draggedEntry = draggedEntryId ? entryMap.get(draggedEntryId) || null : null;

  useEffect(() => {
    if (activeFolderAncestors.size === 0) return;
    setOpenState((prev) => {
      let changed = false;
      const next = { ...prev };
      activeFolderAncestors.forEach((folderId) => {
        if (next[folderId] === false) {
          next[folderId] = true;
          changed = true;
        }
      });
      if (changed) {
        writeOpenState(next);
        return next;
      }
      return prev;
    });
  }, [activeFolderAncestors]);

  const toggleFolder = (folderId) => {
    setOpenState((prev) => {
      const next = { ...prev, [folderId]: !(prev[folderId] ?? true) };
      writeOpenState(next);
      return next;
    });
  };

  const clearDragState = () => {
    setDraggedEntryId('');
    setDropTargetId('');
  };

  const isSameTarget = (entry, targetFolderId) => normalizeId(entry?.folder) === normalizeId(targetFolderId);

  const handleDragStart = (entry, event) => {
    const entryId = normalizeId(entry?._id);
    if (!entryId || normalizeId(movingEntryId) === entryId) return;
    if (event?.dataTransfer?.setData) {
      event.dataTransfer.setData(DRAG_DATA_KEY, entryId);
      event.dataTransfer.effectAllowed = 'move';
    }
    setDraggedEntryId(entryId);
  };

  const handleDragEnd = () => {
    clearDragState();
  };

  const allowDropTarget = (event, targetFolderId) => {
    if (!draggedEntry || isSameTarget(draggedEntry, targetFolderId)) return false;
    event.preventDefault();
    if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
    return true;
  };

  const handleDropTargetDragOver = (targetFolderId) => (event) => {
    if (!allowDropTarget(event, targetFolderId)) return;
    setDropTargetId(normalizeId(targetFolderId) || 'root');
  };

  const handleDropTargetDragLeave = (targetFolderId) => (event) => {
    const nextTargetId = normalizeId(targetFolderId) || 'root';
    const related = event?.relatedTarget;
    if (related && event.currentTarget?.contains?.(related)) return;
    setDropTargetId((prev) => (prev === nextTargetId ? '' : prev));
  };

  const handleDropTargetDrop = (targetFolderId) => (event) => {
    if (!draggedEntry || !allowDropTarget(event, targetFolderId)) {
      clearDragState();
      return;
    }
    onMoveEntry(draggedEntry, targetFolderId || null);
    clearDragState();
  };

  const renderFolderNode = (node, depth = 0) => {
    const isExpanded = (openState[node._id] ?? true) || activeFolderAncestors.has(node._id);
    const childCount = countVisibleEntries(node);
    const hasChildren = node.children.length > 0 || node.entries.length > 0;
    const isDropTarget = dropTargetId === node._id;
    return (
      <div key={node._id} className="notebook-folder-tree__node">
        <div
          className={`notebook-folder-tree__drop-target ${isDropTarget ? 'is-drop-target' : ''}`.trim()}
          onDragOver={handleDropTargetDragOver(node._id)}
          onDragLeave={handleDropTargetDragLeave(node._id)}
          onDrop={handleDropTargetDrop(node._id)}
          data-testid={`folder-drop-target-${node._id}`}
        >
          <FolderRow
            id={node._id}
            name={node.name}
            count={childCount}
            selected={activeFolderAncestors.has(node._id)}
            depth={depth}
            isExpanded={isExpanded}
            hasChildren={hasChildren}
            onToggle={toggleFolder}
            onSelect={toggleFolder}
          />
        </div>
        {hasChildren && isExpanded ? (
          <div className="notebook-folder-tree__children">
            {node.children.map((child) => renderFolderNode(child, depth + 1))}
            {node.entries.map((entry) => (
              <NotebookEntryRow
                key={normalizeId(entry?._id) || `${node._id}-${entry?.title || 'entry'}`}
                entry={entry}
                depth={depth + 1}
                isActive={normalizeId(activeEntryId) === normalizeId(entry?._id)}
                isDragging={normalizeId(draggedEntryId) === normalizeId(entry?._id)}
                moving={normalizeId(movingEntryId) === normalizeId(entry?._id)}
                onSelectEntry={onSelectEntry}
                onRequestMoveEntry={onRequestMoveEntry}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  if (entries.length === 0 && roots.length === 0) {
    return <p className="think-calm-empty-line">{emptyMessage}</p>;
  }

  return (
    <div className="notebook-folder-tree">
      {roots.map((node) => renderFolderNode(node))}
      <div
        className={`notebook-folder-tree__root ${dropTargetId === 'root' ? 'is-drop-target' : ''}`.trim()}
        onDragOver={handleDropTargetDragOver(null)}
        onDragLeave={handleDropTargetDragLeave(null)}
        onDrop={handleDropTargetDrop(null)}
        data-testid="folder-drop-target-root"
      >
        <div className="notebook-folder-tree__root-label">{ROOT_SECTION_LABEL}</div>
        <div className="notebook-folder-tree__children">
          {rootEntries.map((entry) => (
            <NotebookEntryRow
              key={normalizeId(entry?._id) || `root-${entry?.title || 'entry'}`}
              entry={entry}
              depth={0}
              isActive={normalizeId(activeEntryId) === normalizeId(entry?._id)}
              isDragging={normalizeId(draggedEntryId) === normalizeId(entry?._id)}
              moving={normalizeId(movingEntryId) === normalizeId(entry?._id)}
              onSelectEntry={onSelectEntry}
              onRequestMoveEntry={onRequestMoveEntry}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))}
          {rootEntries.length === 0 ? (
            <div className="notebook-folder-tree__root-empty">Drop a note here to keep it loose.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default NotebookFolderTree;
