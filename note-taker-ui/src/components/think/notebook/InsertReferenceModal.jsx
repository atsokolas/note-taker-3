import React, { useMemo, useState } from 'react';
import { Button, QuietButton } from '../../ui';

/**
 * @typedef {Object} InsertReferenceModalProps
 * @property {boolean} open
 * @property {string} title
 * @property {string} subtitle
 * @property {Array<any>} items
 * @property {(item: any) => string} getLabel
 * @property {(item: any) => string} [getMeta]
 * @property {(item: any) => string[]} [getTags]
 * @property {string} [placeholder]
 * @property {(item: any) => void} onSelect
 * @property {() => void} onClose
 */

const InsertReferenceModal = ({
  open,
  title,
  subtitle,
  items,
  getLabel,
  getMeta,
  getTags,
  placeholder = 'Search...',
  onSelect,
  onClose
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item => {
      const label = getLabel(item)?.toLowerCase() || '';
      const meta = getMeta ? getMeta(item)?.toLowerCase() || '' : '';
      const tags = getTags ? getTags(item).join(' ').toLowerCase() : '';
      return label.includes(q) || meta.includes(q) || tags.includes(q);
    });
  }, [items, query, getLabel, getMeta, getTags]);

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p className="muted small">{subtitle}</p>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="modal-highlight-list">
          {filtered.map(item => (
            <div key={item._id || getLabel(item)} className="modal-highlight-item">
              <div className="modal-highlight-title">{getLabel(item)}</div>
              {getMeta && <p className="modal-highlight-text">{getMeta(item)}</p>}
              <div className="modal-highlight-actions">
                <Button variant="secondary" onClick={() => onSelect(item)}>Insert</Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="muted small">No matches found.</p>}
        </div>
        <div className="modal-footer">
          <QuietButton onClick={onClose}>Close</QuietButton>
        </div>
      </div>
    </div>
  );
};

export default InsertReferenceModal;
