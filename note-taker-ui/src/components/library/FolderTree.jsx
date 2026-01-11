import React, { useMemo, useState } from 'react';
import FolderRow from './FolderRow';

/**
 * @typedef {Object} Folder
 * @property {string} _id
 * @property {string} name
 * @property {Folder[]} [children]
 */

const STORAGE_KEY = 'library.folderTree.open';

const loadOpenState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
};

const saveOpenState = (state) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const buildTree = (folders) => {
  const nodes = folders.map(folder => ({ ...folder, children: [] }));
  return nodes;
};

/**
 * @param {{
 *  folders: Folder[],
 *  counts: Record<string, number>,
 *  selectedFolderId: string,
 *  onSelectFolder: (id: string) => void
 * }} props
 */
const FolderTree = ({
  folders,
  counts,
  selectedFolderId,
  onSelectFolder
}) => {
  const [openState, setOpenState] = useState(loadOpenState);
  const tree = useMemo(() => buildTree(folders), [folders]);

  const toggle = (id) => {
    setOpenState(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveOpenState(next);
      return next;
    });
  };

  const renderNode = (node, depth = 0) => {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isExpanded = openState[node._id] ?? true;
    return (
      <div key={node._id} className="library-folder-node">
        <FolderRow
          id={node._id}
          name={node.name}
          count={counts[node._id]}
          selected={selectedFolderId === node._id}
          depth={depth}
          isExpanded={isExpanded}
          hasChildren={hasChildren}
          onToggle={toggle}
          onSelect={onSelectFolder}
        />
        {hasChildren && isExpanded && (
          <div className="library-folder-children">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="library-folder-tree">
      {tree.map(node => renderNode(node))}
    </div>
  );
};

export default FolderTree;
