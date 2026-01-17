import React, { useEffect, useMemo, useState } from 'react';
import { QuietButton } from '../ui';
import useConcepts from '../../hooks/useConcepts';

const LibraryConceptModal = ({ open, highlight, onClose, onSelect }) => {
  const { concepts, loading, error } = useConcepts();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return concepts;
    return concepts.filter(concept => concept.name.toLowerCase().includes(q));
  }, [concepts, query]);

  if (!open || !highlight) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>Add to Concept</h3>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        {loading && <p className="muted small">Loading concepts…</p>}
        {error && <p className="status-message error-message">{error}</p>}
        <label className="feedback-field">
          <span>Search or create</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a concept name"
          />
        </label>
        <div className="library-folder-picker">
          {filtered.map(concept => (
            <QuietButton
              key={concept.name}
              onClick={() => onSelect(highlight, concept.name)}
            >
              {concept.name}
            </QuietButton>
          ))}
          {!loading && filtered.length === 0 && <p className="muted small">No concepts yet.</p>}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <QuietButton onClick={onClose}>Cancel</QuietButton>
          <QuietButton onClick={() => onSelect(highlight, query.trim())} disabled={!query.trim()}>
            Create new
          </QuietButton>
        </div>
      </div>
    </div>
  );
};

export default LibraryConceptModal;
