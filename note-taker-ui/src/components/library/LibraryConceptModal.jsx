import React from 'react';
import { QuietButton } from '../ui';
import useConcepts from '../../hooks/useConcepts';

const LibraryConceptModal = ({ open, highlight, onClose, onSelect }) => {
  const { concepts, loading, error } = useConcepts();

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
        <div className="library-folder-picker">
          {concepts.map(concept => (
            <QuietButton
              key={concept.name}
              onClick={() => onSelect(highlight, concept.name)}
            >
              {concept.name}
            </QuietButton>
          ))}
          {!loading && concepts.length === 0 && <p className="muted small">No concepts yet.</p>}
        </div>
      </div>
    </div>
  );
};

export default LibraryConceptModal;
