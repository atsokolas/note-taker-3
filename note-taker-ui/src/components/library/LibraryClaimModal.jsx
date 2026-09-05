import React, { useEffect, useState } from 'react';
import { Button, QuietButton } from '../ui';

/**
 * Holding a belief, from a sentence you marked.
 *
 * The one door into the ledger from the Library. Everything the morning paper
 * reads is claims — a belief a year old, how your confidence met later
 * outcomes, the falsifier a watcher matched — and until now nothing in the
 * reading room could make one.
 *
 * It asks for two things, and both are asked here because neither can be
 * added honestly later:
 *
 * The claim is *your* sentence. The highlight is what someone else wrote; a
 * belief in their words is a quotation. So the field starts empty with the
 * marked sentence shown beside it, rather than pre-filled with words the
 * reader would only edit into something worse.
 *
 * And what would change your mind, optional, because a belief you cannot
 * falsify yet is still a belief — but asked now, while the reader is holding
 * the evidence, which is the only moment they reliably know.
 */
const LibraryClaimModal = ({ open, highlight, onClose, onCreate }) => {
  const [claim, setClaim] = useState('');
  const [criteria, setCriteria] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setClaim('');
    setCriteria('');
    setError('');
    setSaving(false);
  }, [open, highlight]);

  if (!open || !highlight) return null;

  const sentence = claim.trim();

  const hold = async () => {
    if (!sentence || saving) return;
    setSaving(true);
    setError('');
    try {
      await onCreate({ claim: sentence, resolutionCriteria: criteria.trim(), highlight });
    } catch (holdError) {
      setError(holdError?.response?.data?.error || 'That claim did not save.');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content library-claim-modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h3>Hold this as a belief</h3>
            <p className="muted small">It joins the ledger, dated today.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* What they marked, shown but not borrowed. */}
        <blockquote className="library-claim-modal__source">
          {highlight.text}
          {highlight.articleTitle ? (
            <cite className="library-claim-modal__cite">{highlight.articleTitle}</cite>
          ) : null}
        </blockquote>

        <label className="feedback-field">
          <span>What do you believe, in your own words?</span>
          <textarea
            autoFocus
            className="noeis-form-control"
            rows={3}
            value={claim}
            placeholder="Alphabet's capex is defensive maintenance, not a bet on new growth"
            data-testid="claim-modal-text"
            onChange={(event) => setClaim(event.target.value)}
          />
        </label>

        <label className="feedback-field">
          <span>What would change your mind?</span>
          <textarea
            className="noeis-form-control"
            rows={2}
            value={criteria}
            placeholder="The observation that would break it — “Nvidia guides datacenter revenue down two quarters running”"
            data-testid="claim-modal-criteria"
            onChange={(event) => setCriteria(event.target.value)}
          />
          {/* The reason this field is worth filling, said once. */}
          <small className="muted">
            Named here, your watchers look for it. Left empty, nothing is watching.
          </small>
        </label>

        {error ? <p className="status-message error-message">{error}</p> : null}

        <div className="modal-footer">
          <Button variant="secondary" onClick={hold} disabled={!sentence || saving} data-testid="claim-modal-hold">
            {saving ? 'Holding…' : 'Hold it'}
          </Button>
          <QuietButton onClick={onClose} disabled={saving}>Cancel</QuietButton>
        </div>
      </div>
    </div>
  );
};

export default LibraryClaimModal;
