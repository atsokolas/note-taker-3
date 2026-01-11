import React from 'react';
import { QuietButton } from '../ui';

/**
 * @typedef {Object} FolderRowProps
 * @property {string} id
 * @property {string} name
 * @property {number} [count]
 * @property {boolean} selected
 * @property {number} [depth]
 * @property {boolean} [isExpanded]
 * @property {boolean} [hasChildren]
 * @property {(id: string) => void} onToggle
 * @property {(id: string) => void} onSelect
 */

/** @param {FolderRowProps} props */
const FolderRow = ({
  id,
  name,
  count,
  selected,
  depth = 0,
  isExpanded,
  hasChildren,
  onToggle,
  onSelect
}) => (
  <div className={`library-folder-row ${selected ? 'is-selected' : ''}`} style={{ paddingLeft: depth * 12 }}>
    {hasChildren ? (
      <button
        type="button"
        className="library-folder-toggle"
        onClick={() => onToggle(id)}
        aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
      >
        {isExpanded ? '▾' : '▸'}
      </button>
    ) : (
      <span className="library-folder-toggle-spacer" />
    )}
    <QuietButton className="library-folder-button" onClick={() => onSelect(id)}>
      <span className="library-folder-name">{name}</span>
      {typeof count === 'number' && <span className="library-folder-count">{count}</span>}
    </QuietButton>
  </div>
);

export default FolderRow;
