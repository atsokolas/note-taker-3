import React from 'react';
import '../../styles/weekend-readings.css';

const actionForState = (state = {}) => {
  switch (state.code) {
    case 'review_requested':
      return { key: 'approve', label: 'Approve this revision' };
    case 'approved':
      return { key: 'publish', label: 'Publish approved revision' };
    case 'stale_approval':
      return { key: 'review', label: 'Request review of changed draft' };
    case 'published':
      return state.draftChangedAfterPublication
        ? { key: 'review', label: 'Request review of changed draft' }
        : null;
    case 'private_draft':
    default:
      return { key: 'review', label: 'Request review' };
  }
};

const WikiWeekendReadingsPublication = ({
  approvalState = { code: 'private_draft', label: 'Private draft — not public' },
  busy = false,
  error = '',
  publicUrl = '',
  onRequestReview,
  onApprove,
  onPublish
}) => {
  const action = actionForState(approvalState);
  const handlers = { review: onRequestReview, approve: onApprove, publish: onPublish };
  const handler = action ? handlers[action.key] : null;
  return (
    <section className="wiki-weekend-publication" aria-labelledby="weekend-publication-title">
      <div className="wiki-weekend-publication__copy">
        <p className="wiki-weekend-publication__eyebrow">Weekend Readings publication</p>
        <h2 id="weekend-publication-title">Review the exact revision</h2>
        <p className="wiki-weekend-publication__status" role="status">{approvalState.label}</p>
        <p className="wiki-weekend-publication__note">
          Review and publication are separate manual actions. Editing an approved draft requires a new review.
        </p>
        {error ? <p className="wiki-weekend-publication__error" role="alert">{error}</p> : null}
      </div>
      <div className="wiki-weekend-publication__actions">
        {action && handler ? (
          <button type="button" disabled={busy} onClick={handler}>
            {busy ? 'Working…' : action.label}
          </button>
        ) : null}
        {approvalState.code === 'published' && publicUrl ? (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">Open published edition</a>
        ) : null}
      </div>
    </section>
  );
};

export { actionForState };
export default WikiWeekendReadingsPublication;
