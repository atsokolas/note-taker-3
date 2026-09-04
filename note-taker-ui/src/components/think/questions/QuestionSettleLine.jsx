import React, { useEffect, useState } from 'react';
import { QUESTION_SETTLES_LABEL, QUESTION_UNSETTLED_NOTE } from '../thinkObjectDefinitions';

/**
 * What would close this loop, said on the question itself.
 *
 * The composer asks for it at the door, which is the only moment anyone
 * reliably knows. But a question caught in a hurry rarely has one yet, and a
 * field that can only be filled once is a field nobody fills — so it is
 * editable here, and its absence is printed rather than left blank.
 *
 * Printing the absence is the point. A blank line reads as "nothing to add".
 * A question with nothing that would settle it is not finished, it is a mood,
 * and the page should say so out loud.
 */
const QuestionSettleLine = ({ question, saving = false, onSave }) => {
  const settledBy = String(question?.settledBy || '').trim();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(settledBy);

  useEffect(() => {
    setEditing(false);
    setDraft(settledBy);
  }, [question?._id, settledBy]);

  if (!question?._id) return null;

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next === settledBy) return;
    onSave?.({ ...question, settledBy: next });
  };

  if (editing) {
    return (
      <div className="question-settle" data-testid="question-settle-line">
        <span className="question-settle__label">{QUESTION_SETTLES_LABEL}</span>
        <textarea
          autoFocus
          className="noeis-form-control question-settle__field"
          rows={2}
          value={draft}
          disabled={saving}
          data-testid="question-settle-input"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(settledBy);
              setEditing(false);
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              commit();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="question-settle" data-testid="question-settle-line">
      <span className="question-settle__label">{QUESTION_SETTLES_LABEL}</span>
      {/* A plain button, not a QuietButton: that one is a caps micro-label
          and this is a sentence you can click into. */}
      <button
        type="button"
        className={`question-settle__value ${settledBy ? '' : 'is-unnamed'}`.trim()}
        onClick={() => setEditing(true)}
        data-testid="question-settle-edit"
      >
        {settledBy || QUESTION_UNSETTLED_NOTE}
      </button>
    </div>
  );
};

export default QuestionSettleLine;
