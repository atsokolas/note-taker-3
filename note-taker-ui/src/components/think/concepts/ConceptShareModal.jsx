import React, { useEffect, useRef, useState } from 'react';
import { Button, QuietButton } from '../../ui';
import {
  getConceptShare,
  mintConceptShare,
  revokeConceptShare,
  updateConceptShare
} from '../../../api/concepts';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import ConceptShareView from '../ConceptShareView';
import {
  CONCEPT_SHARE_PRIVACY,
  THINK_SHARE_REVOKE
} from '../thinkShareFixture';

const buildShareUrl = (slug) => {
  if (typeof window === 'undefined') return `/share/concepts/${slug}`;
  return `${window.location.origin}/share/concepts/${slug}`;
};

const actionErrorOf = (error, fallback) => (
  error?.response?.data?.error || error?.message || fallback
);

const ShareIncludesList = () => (
  <ul className="concept-share-modal__includes" aria-label="What's included">
    <li>
      <span className="concept-share-modal__includes-icon" aria-hidden="true">✓</span>
      Working hypothesis, support, tension, and open questions
    </li>
    <li>
      <span className="concept-share-modal__includes-icon concept-share-modal__includes-icon--neg" aria-hidden="true">—</span>
      No concept note, agent, editor, or private source trail
    </li>
    <li>
      <span className="concept-share-modal__includes-icon concept-share-modal__includes-icon--neg" aria-hidden="true">—</span>
      Later private edits stay in the workshop until you replace this version
    </li>
  </ul>
);

const ConceptShareModal = ({ open, conceptName, onClose }) => {
  const reduced = usePrefersReducedMotion();
  const urlRef = useRef(null);
  const [state, setState] = useState({ shared: false });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [correction, setCorrection] = useState('');

  useEffect(() => {
    if (!open || !conceptName) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setCopyStatus('');
    setCorrection('');
    getConceptShare(conceptName)
      .then((data) => {
        if (cancelled) return;
        setState(data || { shared: false });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(actionErrorOf(err, 'Failed to load share state.'));
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
      const data = await mintConceptShare(conceptName, { previewHash: state.currentHash });
      setState(data);
    } catch (err) {
      setError(actionErrorOf(err, 'That did not save.'));
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await updateConceptShare(conceptName, {
        previewHash: state.currentHash,
        correction
      });
      setState(data);
      setCorrection('');
    } catch (err) {
      setError(actionErrorOf(err, 'That did not save.'));
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
      setState({
        shared: false,
        publishable: state.publishable,
        preview: state.preview,
        currentHash: state.currentHash
      });
    } catch (err) {
      setError(actionErrorOf(err, 'That did not save.'));
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
      if (!reduced) setTimeout(() => setCopyStatus(''), 2400);
    } catch (_err) {
      setCopyStatus('Copy failed — select the URL manually.');
      urlRef.current?.focus();
      urlRef.current?.select();
    }
  };

  if (!open) return null;

  const url = state.slug ? buildShareUrl(state.slug) : '';
  const stale = Boolean(state.shared && state.stale);
  const reader = state.shared ? (state.snapshot || (stale ? null : state.preview)) : state.preview;
  const pending = stale ? state.preview : null;
  const publishable = state.publishable !== false && Boolean(String(state.preview?.concept?.name || conceptName || '').trim());

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
            <p className="muted small concept-share-modal__lede">{CONCEPT_SHARE_PRIVACY}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {loading ? (
          <p className="muted small concept-share-modal__loading">Loading…</p>
        ) : error && !state.shared && !state.preview ? (
          <p className="status-message error-message">{error}</p>
        ) : (
          <div className={state.shared ? 'concept-share-modal__active' : 'concept-share-modal__inactive'}>
            {reader?.concept ? (
              <div className="concept-share-modal__reader" data-testid="concept-share-preview">
                <p className="concept-share-modal__reader-label">What a reader will see</p>
                <ConceptShareView snapshot={reader} compact />
              </div>
            ) : null}
            {pending?.concept ? (
              <div
                className="concept-share-modal__reader concept-share-modal__reader--pending"
                data-testid="concept-share-pending"
              >
                <p className="concept-share-modal__reader-label">Pending an update</p>
                <ConceptShareView snapshot={pending} compact />
              </div>
            ) : null}
            {!state.shared ? (
              <>
                <p className="concept-share-modal__pitch">
                  Create a public link to share your thinking on <strong>{conceptName}</strong>.
                </p>
                <ShareIncludesList />
              </>
            ) : (
              <div className="concept-share-modal__active-controls">
                <label className="concept-share-modal__label" htmlFor="concept-share-url">Public link</label>
                <div className="concept-share-modal__url-row">
                  <input
                    id="concept-share-url"
                    ref={urlRef}
                    className="concept-share-modal__url"
                    type="text"
                    value={url}
                    readOnly
                    onFocus={(event) => event.target.select()}
                  />
                  <Button variant="secondary" onClick={handleCopy} disabled={busy}>Copy link</Button>
                </div>
                <p className="muted small">{THINK_SHARE_REVOKE}</p>
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
                {stale ? (
                  <div className="concept-share-modal__note">
                    <label className="concept-share-modal__label" htmlFor="concept-share-correction">
                      What changed
                    </label>
                    <textarea
                      id="concept-share-correction"
                      className="concept-share-modal__correction"
                      data-testid="concept-share-correction"
                      value={correction}
                      maxLength={400}
                      rows={3}
                      onChange={(event) => setCorrection(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            )}
            {state.shared ? (
              <div className="modal-footer insert-modal__footer">
                <span className="insert-modal__footer-hint">
                  <kbd>esc</kbd> to close
                </span>
                <div className="concept-share-modal__actions">
                  {stale ? (
                    <Button type="button" onClick={handleUpdate} disabled={busy} data-testid="concept-update-share">
                      {busy ? 'Updating…' : 'Update shared version'}
                    </Button>
                  ) : null}
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
              <>
                {publishable ? (
                  <div className="concept-share-modal__cta-row">
                    <Button variant="primary" onClick={handleMint} disabled={busy} data-testid="concept-publish-share">
                      {busy ? 'Creating link…' : 'Create public link'}
                    </Button>
                  </div>
                ) : (
                  <p className="muted small" data-testid="concept-share-silence">Nothing to share yet.</p>
                )}
                <div className="modal-footer insert-modal__footer">
                  <span className="insert-modal__footer-hint">
                    <kbd>esc</kbd> to close
                  </span>
                  <QuietButton onClick={onClose}>Cancel</QuietButton>
                </div>
              </>
            )}
            {error ? <p className="status-message error-message">{error}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConceptShareModal;
