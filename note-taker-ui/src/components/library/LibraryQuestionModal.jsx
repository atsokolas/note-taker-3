import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import useConcepts from '../../hooks/useConcepts';

const LibraryQuestionModal = ({ open, highlight, onClose, onCreate }) => {
  const { concepts } = useConcepts();
  const [text, setText] = useState('');
  const [conceptName, setConceptName] = useState('');

  useEffect(() => {
    if (!open || !highlight) return;
    setText(highlight.text || '');
    setConceptName(highlight.tags?.[0] || '');
  }, [open, highlight]);

  if (!open || !highlight) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>New Question</h3>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <label className="feedback-field">
          <span>Question</span>
          <input
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="feedback-field">
          <span>Concept</span>
          <select value={conceptName} onChange={(event) => setConceptName(event.target.value)}>
            <option value="">No concept</option>
            {concepts.map(concept => (
              <option key={concept.name} value={concept.name}>{concept.name}</option>
            ))}
          </select>
        </label>
        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate(highlight, conceptName, text || 'New question')}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LibraryQuestionModal;
