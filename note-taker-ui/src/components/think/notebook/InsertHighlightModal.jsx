import React, { useMemo, useState } from 'react';
import { Button, TagChip, QuietButton } from '../../ui';

const InsertHighlightModal = ({ open, highlights, loading, error, onClose, onSelect }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return highlights;
    return highlights.filter(h => {
      const text = h.text?.toLowerCase() || '';
      const article = h.articleTitle?.toLowerCase() || '';
      const tags = (h.tags || []).join(' ').toLowerCase();
      return text.includes(q) || article.includes(q) || tags.includes(q);
    });
  }, [highlights, query]);

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3>Insert Highlight</h3>
            <p className="muted small">Search by text, tag, or article.</p>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <input
          type="text"
          placeholder="Search highlights..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {loading && <p className="muted small">Loading highlights…</p>}
        {error && <p className="status-message error-message">{error}</p>}
        {!loading && !error && (
          <div className="modal-highlight-list">
            {filtered.map(h => (
              <div key={h._id} className="modal-highlight-item">
                <div className="modal-highlight-title">{h.articleTitle || 'Untitled article'}</div>
                <p className="modal-highlight-text">{h.text}</p>
                <div className="modal-highlight-tags">
                  {(h.tags || []).length > 0 ? (
                    h.tags.map(tag => (
                      <TagChip key={`${h._id}-${tag}`}>{tag}</TagChip>
                    ))
                  ) : (
                    <span className="muted small">No tags</span>
                  )}
                </div>
                <div className="modal-highlight-actions">
                  <Button variant="secondary" onClick={() => onSelect(h)}>Insert</Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="muted small">No highlights found.</p>}
          </div>
        )}
        <div className="modal-footer">
          <QuietButton onClick={onClose}>Close</QuietButton>
        </div>
      </div>
    </div>
  );
};

export default InsertHighlightModal;
