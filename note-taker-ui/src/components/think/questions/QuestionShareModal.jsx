import React, { useEffect, useRef, useState } from 'react';
import { Button, QuietButton } from '../../ui';
import {
  getQuestionShare,
  mintQuestionShare,
  revokeQuestionShare,
  updateQuestionShare
} from '../../../api/questions';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import QuestionShareView from '../QuestionShareView';
import {
  QUESTION_SHARE_PRIVACY,
  THINK_SHARE_REVOKE
} from '../thinkShareFixture';

const buildShareUrl = (slug) => {
  if (typeof window === 'undefined') return `/share/questions/${slug}`;
  return `${window.location.origin}/share/questions/${slug}`;
};

const actionErrorOf = (error, fallback) => (
  error?.response?.data?.error || error?.message || fallback
);

const ShareIncludesList = () => (
  <ul className="concept-share-modal__includes" aria-label="What's included">
    <li>
      <span className="concept-share-modal__includes-icon" aria-hidden="true">✓</span>
      Question text and authored paragraph blocks
    </li>
    <li>
      <span className="concept-share-modal__includes-icon concept-share-modal__includes-icon--neg" aria-hidden="true">—</span>
      No library highlights, private notes, or agent thread
    </li>
    <li>
      <span className="concept-share-modal__includes-icon concept-share-modal__includes-icon--neg" aria-hidden="true">—</span>
      Later private edits stay in the workshop until you replace this version
    </li>
  </ul>
);

const QuestionShareModal = ({ open, questionId, questionText, onClose }) => {
  const reduced = usePrefersReducedMotion();
  const urlRef = useRef(null);
  const [state, setState] = useState({ shared: false });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [correction, setCorrection] = useState('');

  useEffect(() => {
    if (!open || !questionId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setCopyStatus('');
    setCorrection('');
    getQuestionShare(questionId)
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
  }, [open, questionId]);

  const handleMint = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await mintQuestionShare(questionId, { previewHash: state.currentHash });
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
      const data = await updateQuestionShare(questionId, {
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
      await revokeQuestionShare(questionId);
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
  const publishable = state.publishable !== false && Boolean(String(state.preview?.question?.text || questionText || '').trim());

  return (
    <div
      className="modal-overlay modal-overlay--insert"
      data-testid="question-share-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="modal-content modal-content--insert concept-share-modal" role="dialog" aria-label="Share question">
        <div className="modal-header concept-share-modal__header">
          <div className="concept-share-modal__heading">
            <span className="concept-share-modal__eyebrow">Public share</span>
            <h3>Share this question</h3>
            <p className="muted small concept-share-modal__lede">{QUESTION_SHARE_PRIVACY}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {loading ? (
          <p className="muted small concept-share-modal__loading">Loading…</p>
        ) : error && !state.shared && !state.preview ? (
          <p className="status-message error-message">{error}</p>
        ) : (
          <div className="concept-share-modal__active">
            {reader?.question ? (
              <div className="concept-share-modal__reader" data-testid="question-share-preview">
                <p className="concept-share-modal__reader-label">What a reader will see</p>
                <QuestionShareView snapshot={reader} compact />
              </div>
            ) : null}
            {pending?.question ? (
              <div
                className="concept-share-modal__reader concept-share-modal__reader--pending"
                data-testid="question-share-pending"
              >
                <p className="concept-share-modal__reader-label">Pending an update</p>
                <QuestionShareView snapshot={pending} compact />
              </div>
            ) : null}
            {!reader?.question && !publishable ? (
              <p className="muted small" data-testid="question-share-silence">Nothing to share yet.</p>
            ) : null}
            {!state.shared ? <ShareIncludesList /> : null}
            {state.shared ? (
              <div className="concept-share-modal__active-controls">
                <label className="concept-share-modal__label" htmlFor="question-share-url">Public link</label>
                <div className="concept-share-modal__url-row">
                  <input
                    id="question-share-url"
                    ref={urlRef}
                    className="concept-share-modal__url"
                    readOnly
                    value={url}
                    onFocus={(event) => event.target.select()}
                  />
                  <Button type="button" variant="secondary" onClick={handleCopy} disabled={busy}>
                    Copy link
                  </Button>
                </div>
                <p className="muted small">{THINK_SHARE_REVOKE}</p>
                {copyStatus ? <p className="muted small">{copyStatus}</p> : null}
                {stale ? (
                  <div className="concept-share-modal__note">
                    <label className="concept-share-modal__label" htmlFor="question-share-correction">
                      What changed
                    </label>
                    <textarea
                      id="question-share-correction"
                      className="concept-share-modal__correction"
                      data-testid="question-share-correction"
                      value={correction}
                      maxLength={400}
                      rows={3}
                      onChange={(event) => setCorrection(event.target.value)}
                    />
                  </div>
                ) : null}
                <div className="concept-share-modal__actions">
                  {stale ? (
                    <Button type="button" onClick={handleUpdate} disabled={busy} data-testid="question-update-share">
                      {busy ? 'Updating…' : 'Update shared version'}
                    </Button>
                  ) : null}
                  <QuietButton type="button" onClick={handleRevoke} disabled={busy}>
                    Revoke link
                  </QuietButton>
                  <Button type="button" onClick={onClose}>Done</Button>
                </div>
              </div>
            ) : publishable ? (
              <div className="concept-share-modal__actions">
                <Button type="button" onClick={handleMint} disabled={busy} data-testid="question-publish-share">
                  Create public link
                </Button>
                <QuietButton type="button" onClick={onClose}>Cancel</QuietButton>
              </div>
            ) : (
              <div className="concept-share-modal__actions">
                <QuietButton type="button" onClick={onClose}>Cancel</QuietButton>
              </div>
            )}
            {error ? <p className="status-message error-message">{error}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionShareModal;
