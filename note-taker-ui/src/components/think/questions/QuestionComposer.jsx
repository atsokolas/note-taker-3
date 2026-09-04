import React, { useEffect, useRef, useState } from 'react';
import { Button, QuietButton } from '../../ui';
import { QUESTION_SETTLES_LABEL, QUESTION_SETTLES_PLACEHOLDER } from '../thinkObjectDefinitions';

/**
 * Asking for a question before making one.
 *
 * A new question used to be created the instant you pressed the button, with
 * the title "New question" already in it. Two things followed from that: the
 * shelf filled with rows called New question that nobody ever renamed, and
 * the one moment the product had your attention — the moment you decided
 * there was something you did not know — went by without asking anything.
 *
 * So it asks. The question, and the thing that would close it. The second
 * field is optional and never blocks: catching the question matters more
 * than knowing its answer shape, and an unanswered one is said out loud on
 * the question itself rather than left to look finished.
 */
const QuestionComposer = ({
  open,
  saving = false,
  error = '',
  conceptName = '',
  onSubmit,
  onCancel
}) => {
  const [text, setText] = useState('');
  const [settledBy, setSettledBy] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setText('');
      setSettledBy('');
      return;
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const asked = text.trim();
  const submit = () => {
    if (!asked || saving) return;
    onSubmit?.({ text: asked, settledBy: settledBy.trim() });
  };

  return (
    <div className="think-composer-popover" data-testid="think-question-composer-popover">
      <label className="feedback-field think-composer-field">
        <span>{conceptName ? `What is still open inside ${conceptName}?` : 'What is still open?'}</span>
        <textarea
          ref={inputRef}
          className="noeis-form-control"
          value={text}
          rows={2}
          placeholder="The thing you do not know yet"
          data-testid="think-question-composer-input"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel?.();
            }
            /* Enter breaks the line, because questions run long. The chord
               commits, the way it does everywhere else in this product. */
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
      </label>

      <label className="feedback-field think-composer-field">
        <span>{QUESTION_SETTLES_LABEL}</span>
        <textarea
          className="noeis-form-control"
          value={settledBy}
          rows={2}
          placeholder={QUESTION_SETTLES_PLACEHOLDER}
          data-testid="think-question-composer-settles"
          onChange={(event) => setSettledBy(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel?.();
            }
          }}
        />
      </label>

      <div className="think-composer-actions">
        <Button
          variant="secondary"
          onClick={submit}
          disabled={saving || !asked}
          data-testid="think-question-composer-submit"
        >
          {saving ? 'Adding…' : 'Add question'}
        </Button>
        <QuietButton onClick={onCancel} disabled={saving}>Cancel</QuietButton>
      </div>

      {error ? (
        <p className="think-composer-status is-error" data-testid="think-question-composer-status">{error}</p>
      ) : null}
    </div>
  );
};

export default QuestionComposer;
