import React, { useEffect, useMemo, useState } from 'react';
import { Button, QuietButton } from '../../ui';
import { getConceptShare, mintConceptShare, revokeConceptShare } from '../../../api/concepts';

/**
 * ConceptShareModal — owner-facing share controls for a concept.
 *
 * Behavior:
 *  - On open, GET current share state.
 *  - "Create public link" mints a slug; URL becomes /share/concepts/:slug.
 *  - "Revoke" deletes the share row.
 *  - "Copy link" copies the URL to clipboard.
 *
 * Anyone with the link can view a stripped read-only snapshot. Revoking
 * regenerates on next mint (de-facto rotation).
 */

const buildShareUrl = (slug) => {
  if (typeof window === 'undefined') return `/share/concepts/${slug}`;
  return `${window.location.origin}/share/concepts/${slug}`;
};

const buildShareHostLabel = () => {
  if (typeof window === 'undefined') return 'noeis';
  try {
    return window.location.host.replace(/^www\./, '') || 'noeis';
  } catch (_err) {
    return 'noeis';
  }
};

// Mini "what your share will look like" card. Intentionally does not fetch
// real concept content — it's a brand reassurance, not a true preview.
const ShareLinkPreviewCard = ({ conceptName, host }) => (
  <div className="concept-share-modal__preview" aria-hidden="true">
    <div className="concept-share-modal__preview-bar">
      <span className="concept-share-modal__preview-dot" />
      <span className="concept-share-modal__preview-dot" />
      <span className="concept-share-modal__preview-dot" />
      <span className="concept-share-modal__preview-host">{host}/share/concepts/…</span>
    </div>
    <div className="concept-share-modal__preview-body">
      <span className="concept-share-modal__preview-brand">
        <span className="concept-share-modal__preview-mark" />
        Noeis
      </span>
      <span className="concept-share-modal__preview-eyebrow">Shared concept</span>
      <span className="concept-share-modal__preview-title">{conceptName || 'Your concept'}</span>
      <span className="concept-share-modal__preview-meta">A read-only snapshot · Updated just now</span>
    </div>
  </div>
);

const ShareIncludesList = () => (
  <ul className="concept-share-modal__includes" aria-label="What's included">
    <li>
      <span className="concept-share-modal__includes-icon" aria-hidden="true">✓</span>
      Working hypothesis, support, tension, and open questions
    </li>
    <li>
      <span className="concept-share-modal__includes-icon" aria-hidden="true">✓</span>
      Optional concept note (read-only)
    </li>
    <li>
      <span className="concept-share-modal__includes-icon concept-share-modal__includes-icon--neg" aria-hidden="true">—</span>
      No agent, no editor, no comments
    </li>
    <li>
      <span className="concept-share-modal__includes-icon concept-share-modal__includes-icon--neg" aria-hidden="true">—</span>
      Revoke any time — the link stops working immediately
    </li>
  </ul>
);

const ConceptShareModal = ({ open, conceptName, onClose }) => {
  const [state, setState] = useState({ shared: false });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!open || !conceptName) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setCopyStatus('');
    getConceptShare(conceptName)
      .then((data) => {
        if (cancelled) return;
        setState(data || { shared: false });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.error || 'Failed to load share state.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conceptName]);

  const handleMint = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await mintConceptShare(conceptName);
      setState({ shared: true, slug: data.slug, createdAt: data.createdAt });
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create share link.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Revoke this share link? Anyone with the existing link will lose access immediately.')) return;
    setBusy(true);
    setError('');
    try {
      await revokeConceptShare(conceptName);
      setState({ shared: false });
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to revoke share.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!state.slug) return;
    const shareUrl = buildShareUrl(state.slug);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus('Link copied to clipboard.');
      setTimeout(() => setCopyStatus(''), 2400);
    } catch (_err) {
      setCopyStatus('Copy failed — select the URL manually.');
    }
  };

  const host = useMemo(() => buildShareHostLabel(), []);
  if (!open) return null;

  const url = state.slug ? buildShareUrl(state.slug) : '';

  return (
    <div
      className="modal-overlay modal-overlay--insert"
      data-testid="concept-share-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="modal-content modal-content--insert concept-share-modal" role="dialog" aria-label="Share concept">
        <div className="modal-header concept-share-modal__header">
          <div className="concept-share-modal__heading">
            <span className="concept-share-modal__eyebrow">Public share</span>
            <h3>Share this concept</h3>
            <p className="muted small concept-share-modal__lede">
              Anyone with the link can read a snapshot of the working hypothesis,
              support, tension, and open questions. No agent, no editor.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {loading ? (
          <p className="muted small concept-share-modal__loading">Loading…</p>
        ) : error ? (
          <p className="status-message error-message">{error}</p>
        ) : state.shared ? (
          <div className="concept-share-modal__active">
            <ShareLinkPreviewCard conceptName={conceptName} host={host} />
            <div className="concept-share-modal__active-controls">
              <label className="concept-share-modal__label" htmlFor="concept-share-url">Public link</label>
              <div className="concept-share-modal__url-row">
                <input
                  id="concept-share-url"
                  className="concept-share-modal__url"
                  type="text"
                  value={url}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
                <Button variant="secondary" onClick={handleCopy} disabled={busy}>Copy link</Button>
              </div>
              <div className="concept-share-modal__active-actions">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="concept-share-modal__open-link"
                >
                  Open in new tab ↗
                </a>
                {copyStatus ? <span className="muted small">{copyStatus}</span> : null}
              </div>
            </div>
            <p className="muted small concept-share-modal__fineprint">
              Visit it any time, or send to anyone. Revoking ends access — minting again gives a new link.
            </p>
            <div className="modal-footer insert-modal__footer">
              <span className="insert-modal__footer-hint">
                <kbd>esc</kbd> to close
              </span>
              <QuietButton
                className="concept-share-modal__revoke"
                onClick={handleRevoke}
                disabled={busy}
              >
                {busy ? 'Working…' : 'Revoke'}
              </QuietButton>
            </div>
          </div>
        ) : (
          <div className="concept-share-modal__inactive">
            <ShareLinkPreviewCard conceptName={conceptName} host={host} />
            <p className="concept-share-modal__pitch">
              Create a public link to share your thinking on <strong>{conceptName}</strong>.
              You can revoke any time.
            </p>
            <ShareIncludesList />
            <div className="concept-share-modal__cta-row">
              <Button variant="primary" onClick={handleMint} disabled={busy}>
                {busy ? 'Creating link…' : 'Create public link'}
              </Button>
            </div>
            <div className="modal-footer insert-modal__footer">
              <span className="insert-modal__footer-hint">
                <kbd>esc</kbd> to close
              </span>
              <QuietButton onClick={onClose}>Cancel</QuietButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConceptShareModal;
