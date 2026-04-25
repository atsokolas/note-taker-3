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
    <div className="modal-overlay modal-overlay--insert">
      <div className="modal-content modal-content--insert">
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p className="muted small">{subtitle}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <input
          type="text"
          className="insert-modal__search"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        <div className="modal-highlight-list">
          {filtered.map(item => (
            <div
              key={item._id || getLabel(item)}
              className="modal-highlight-item is-clickable"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(item);
                }
              }}
            >
              <div className="modal-highlight-title">{getLabel(item)}</div>
              {getMeta && <p className="modal-highlight-text">{getMeta(item)}</p>}
              <div className="modal-highlight-actions">
                <Button variant="secondary" onClick={(event) => { event.stopPropagation(); onSelect(item); }}>Insert</Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="muted small">No matches found.</p>}
        </div>
        <div className="modal-footer insert-modal__footer">
          <span className="insert-modal__footer-hint">
            <kbd>esc</kbd> to close
          </span>
          <QuietButton onClick={onClose}>Close</QuietButton>
        </div>
      </div>
    </div>
  );
};

export default InsertReferenceModal;
