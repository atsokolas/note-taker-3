import React, { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import './SourceCorrectionReview.css';

const VERBS = Object.freeze([
  { action: 'keep', label: 'Keep this work' },
  { action: 'change', label: 'Change the quotation' },
  { action: 'no_change', label: 'No change' }
]);

const SETTLED = Object.freeze({
  keep: 'Kept this work. The old quotation remains what was used.',
  change: 'The quotation now follows the new evidence. The writing is unchanged.',
  no_change: 'No change. The correction does not require this work to move.'
});

const Phrase = ({ segments = [], fallback = '' }) => {
  if (!Array.isArray(segments) || !segments.length) {
    return fallback ? <span>{fallback}</span> : null;
  }
  return segments.map((segment, index) => {
    const key = `${segment.kind}:${index}`;
    if (segment?.kind === 'removed') return <del key={key}>{segment.text}</del>;
    if (segment?.kind === 'added') return <ins key={key}>{segment.text}</ins>;
    return <span key={key}>{segment.text}</span>;
  });
};

export default function SourceCorrectionReview({ preview, onDispose, onSettled }) {
  const reduced = usePrefersReducedMotion();
  const [held, setHeld] = useState(preview);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setHeld(preview);
    setError('');
  }, [preview]);

  if (!held?.eventId || !held.oldQuotation || !held.newEvidence) return null;

  const settled = held.ui === 'settled' && Boolean(held.disposition);

  const run = async (action) => {
    if (busy || settled || typeof onDispose !== 'function') return;
    setBusy(action);
    setError('');
    try {
      const result = await onDispose({ eventId: held.eventId, action });
      const next = result?.sourceCorrection || result?.preview || {
        ...held,
        ui: 'settled',
        disposition: action
      };
      setHeld(next);
      onSettled?.(result);
    } catch (failure) {
      setError(failure?.response?.data?.error || failure?.message || 'This review could not be recorded.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section
      className={[
        'source-correction-review',
        settled ? 'is-settled' : '',
        reduced ? 'is-still' : ''
      ].filter(Boolean).join(' ')}
      aria-label="Source correction"
    >
      <p className="source-correction-review__fold">
        <span className="source-correction-review__label">What changed</span>
        {held.whatChanged || 'The saved passage was corrected.'}
      </p>
      <p className="source-correction-review__fold">
        <span className="source-correction-review__label">What it affects</span>
        {held.whatItAffects || 'this work'}
      </p>
      {!settled ? (
        <p className="source-correction-review__fold">
          <span className="source-correction-review__label">What I need from you</span>
          {held.whatINeed || 'Keep this work, change the quotation, or record no change — including when you cannot tell.'}
        </p>
      ) : null}

      <div className="source-correction-review__wording">
        <p>
          <span className="source-correction-review__label">Used quotation</span>
          {held.oldQuotation}
        </p>
        <p>
          <span className="source-correction-review__label">New evidence</span>
          {held.newEvidence}
        </p>
        <p className="source-correction-review__changed" aria-label="Changed phrase">
          <span className="source-correction-review__label">Changed phrase</span>
          <Phrase segments={held.changedSegments} fallback={held.newEvidence} />
        </p>
      </div>

      <p className="source-correction-review__dates">
        {held.sourceUpdatedOn ? (
          <span>Source corrected {held.sourceUpdatedOn}. This is not a reading date.</span>
        ) : null}
        {settled && held.reviewedOn ? <span> Reviewed {held.reviewedOn}.</span> : null}
      </p>

      {held.sourceHref ? (
        <p className="source-correction-review__source">
          <a href={held.sourceHref}>{held.sourceTitle || 'The source'}</a>
        </p>
      ) : null}

      {settled ? (
        <p className="source-correction-review__receipt" role="status">
          {SETTLED[held.disposition] || SETTLED.no_change}
        </p>
      ) : (
        <>
          <div className="source-correction-review__verbs">
            {VERBS.map((verb) => (
              <button
                key={verb.action}
                type="button"
                disabled={Boolean(busy)}
                aria-busy={busy === verb.action}
                onClick={() => run(verb.action)}
              >
                {verb.label}
              </button>
            ))}
          </div>
          <p className="source-correction-review__hint">
            No change covers cannot tell, mixed outcomes, and a deliberate decision to leave this work as it is.
          </p>
        </>
      )}
      {error ? <p className="source-correction-review__error" role="alert">{error}</p> : null}
    </section>
  );
}
