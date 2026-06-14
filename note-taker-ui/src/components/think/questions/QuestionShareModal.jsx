import React, { useEffect, useMemo, useState } from 'react';
import { Button, QuietButton } from '../../ui';
import { getQuestionShare, mintQuestionShare, revokeQuestionShare } from '../../../api/questions';
import { buildSharePreviewReceipt } from '../../../utils/connectionMagicMoment';

const buildShareUrl = (slug) => {
  if (typeof window === 'undefined') return `/share/questions/${slug}`;
  return `${window.location.origin}/share/questions/${slug}`;
};

const buildShareHostLabel = () => {
  if (typeof window === 'undefined') return 'noeis';
  try {
    return window.location.host.replace(/^www\./, '') || 'noeis';
  } catch (_err) {
    return 'noeis';
  }
};

const ShareLinkPreviewCard = ({ questionText, host }) => (
  <div className="concept-share-modal__preview" aria-hidden="true">
    <div className="concept-share-modal__preview-bar">
      <span className="concept-share-modal__preview-dot" />
      <span className="concept-share-modal__preview-dot" />
      <span className="concept-share-modal__preview-dot" />
      <span className="concept-share-modal__preview-host">{host}/share/questions/…</span>
    </div>
    <div className="concept-share-modal__preview-body">
      <span className="concept-share-modal__preview-brand">
        <span className="concept-share-modal__preview-mark" />
        Noeis
      </span>
      <span className="concept-share-modal__preview-eyebrow">Shared question</span>
      <span className="concept-share-modal__preview-title">{questionText || 'Your question'}</span>
      <span className="concept-share-modal__preview-meta">A read-only thread · Updated just now</span>
    </div>
  </div>
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
      Revoke any time — the link stops working immediately
    </li>
  </ul>
);

const QuestionShareModal = ({ open, questionId, questionText, onClose }) => {
  const [state, setState] = useState({ shared: false });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!open || !questionId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setCopyStatus('');
    getQuestionShare(questionId)
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
  }, [open, questionId]);

  const handleMint = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await mintQuestionShare(questionId);
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
      await revokeQuestionShare(questionId);
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
  const receipt = buildSharePreviewReceipt();

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
            <p className="muted small concept-share-modal__lede">
              Anyone with the link can read the question and authored paragraphs.
              Library highlights and private notes stay withheld.
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
            <ShareLinkPreviewCard questionText={questionText} host={host} />
            <p className="wiki-meta-bar__share concept-share-modal__receipt" role="status">{receipt}</p>
            <div className="concept-share-modal__active-controls">
              <label className="concept-share-modal__label" htmlFor="question-share-url">Public link</label>
              <div className="concept-share-modal__url-row">
                <input
                  id="question-share-url"
                  className="concept-share-modal__url-input"
                  readOnly
                  value={url}
                  onFocus={(event) => event.target.select()}
                />
                <Button type="button" variant="secondary" onClick={handleCopy} disabled={busy}>
                  Copy link
                </Button>
              </div>
              {copyStatus ? <p className="muted small">{copyStatus}</p> : null}
              <div className="concept-share-modal__actions">
                <QuietButton type="button" onClick={handleRevoke} disabled={busy}>
                  Revoke link
                </QuietButton>
                <Button type="button" onClick={onClose}>Done</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="concept-share-modal__idle">
            <ShareLinkPreviewCard questionText={questionText} host={host} />
            <ShareIncludesList />
            <div className="concept-share-modal__actions">
              <Button type="button" onClick={handleMint} disabled={busy}>
                Create public link
              </Button>
              <QuietButton type="button" onClick={onClose}>Cancel</QuietButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionShareModal;
