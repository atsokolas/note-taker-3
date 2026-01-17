import React, { useEffect, useMemo, useState } from 'react';
import { Button, QuietButton } from '../ui';
import useConcepts from '../../hooks/useConcepts';
import useQuestions from '../../hooks/useQuestions';

const LibraryQuestionModal = ({ open, highlight, onClose, onCreate, onAttach }) => {
  const { concepts } = useConcepts();
  const { questions, loading, error } = useQuestions({ status: 'open', enabled: open });
  const [text, setText] = useState('');
  const [conceptName, setConceptName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!open || !highlight) return;
    setText(highlight.text || '');
    setConceptName(highlight.tags?.[0] || '');
    setQuery('');
    setSelectedId('');
  }, [open, highlight]);

  if (!open || !highlight) return null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter(question => question.text.toLowerCase().includes(q));
  }, [questions, query]);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>Add to Question</h3>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        {loading && <p className="muted small">Loading questions…</p>}
        {error && <p className="status-message error-message">{error}</p>}
        <label className="feedback-field">
          <span>Search questions</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search open questions"
          />
        </label>
        <div className="library-folder-picker">
          {filtered.map(question => (
            <QuietButton
              key={question._id}
              className={selectedId === question._id ? 'is-active' : ''}
              onClick={() => setSelectedId(question._id)}
            >
              {question.text}
            </QuietButton>
          ))}
          {!loading && filtered.length === 0 && <p className="muted small">No open questions yet.</p>}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => onAttach(highlight, selectedId)} disabled={!selectedId}>
            Add to selected
          </Button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="muted small" style={{ marginBottom: 6 }}>Or create a new question</div>
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
            <Button onClick={() => onCreate(highlight, conceptName, text || 'New question')}>
              Create new
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LibraryQuestionModal;
