import React, { useEffect, useRef, useState } from 'react';
import { Button, QuietButton } from '../../ui';
import {
  getQuestionShare,
  interpretQuestionContribution,
  mintQuestionShare,
  placeQuestionContribution,
  revokeQuestionShare,
  saveQuestionShareBrief,
  saveQuestionShareMandate,
  saveQuestionShareSuccession,
  importQuestionShareRecords,
  updateQuestionShare
} from '../../../api/questions';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import useQuestionPresence from '../../../hooks/useQuestionPresence';
import QuestionShareView from '../QuestionShareView';
import {
  QUESTION_SHARE_AGREEMENT,
  QUESTION_SHARE_BRIEF,
  QUESTION_SHARE_BRING_RECORDS,
  QUESTION_SHARE_BUDGET,
  QUESTION_SHARE_END_MANDATE,
  QUESTION_SHARE_HAND,
  QUESTION_SHARE_MANDATE,
  QUESTION_SHARE_NAME_MANDATE,
  QUESTION_SHARE_OBSERVATION,
  QUESTION_SHARE_OWNER,
  QUESTION_SHARE_OWNER_REMAINDER,
  QUESTION_SHARE_OUTCOME,
  QUESTION_SHARE_PLACE,
  QUESTION_SHARE_PRIVACY,
  QUESTION_SHARE_RECORDS_HINT,
  QUESTION_SHARE_REVIEW_ROUTE,
  QUESTION_SHARE_SCOPE,
  QUESTION_SHARE_STOP,
  QUESTION_SHARE_TAKE,
  QUESTION_SHARE_TAKE_CHANGED,
  QUESTION_SHARE_TAKE_RECORDS,
  QUESTION_SHARE_TAKEN_BACK,
  QUESTION_SHARE_TOOLS,
  AGENT_MANDATE_TOOLS,
  THINK_SHARE_REVOKE,
  downloadQuestionShareRecords,
  questionPresenceLine,
  shareRecordReceipt
} from '../thinkShareFixture';

const buildShareUrl = (slug) => {
  if (typeof window === 'undefined') return `/share/questions/${slug}`;
  return `${window.location.origin}/share/questions/${slug}`;
};

const actionErrorOf = (error, fallback) => (
  error?.response?.data?.error || error?.message || fallback
);

const asLine = (value) => String(value || '').trim();

const conflictLineOf = (error) => {
  if (error?.response?.status !== 409) return '';
  const field = error?.response?.data?.field;
  if (field === 'withdrawn') return QUESTION_SHARE_TAKEN_BACK;
  if (field === 'updatedAt') return QUESTION_SHARE_TAKE_CHANGED;
  return '';
};

const TakeReading = ({ reading, disabled, onSave }) => {
  const [text, setText] = useState(asLine(reading.interpretation));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fieldId = `question-share-take-${reading.id}`;

  useEffect(() => {
    setText(asLine(reading.interpretation));
  }, [reading.interpretation]);

  const save = async () => {
    if (busy || disabled || !reading.id) return;
    setBusy(true);
    setError('');
    try {
      await onSave(reading.id, asLine(text), reading.updatedAt);
    } catch (_err) {
      setError('That take did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="concept-share-modal__note" data-testid={`question-share-take-${reading.id}`}>
      <label className="concept-share-modal__label" htmlFor={fieldId}>
        How you take this
      </label>
      <p className="muted small">{reading.by}</p>
      <textarea
        id={fieldId}
        className="concept-share-modal__correction"
        value={text}
        maxLength={400}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled || busy}
      />
      <p className="muted small">{QUESTION_SHARE_TAKE}</p>
      {error ? <p className="status-message error-message">{error}</p> : null}
      <Button type="button" variant="secondary" onClick={save} disabled={disabled || busy}>
        {busy ? 'Saving…' : 'Save how you take it'}
      </Button>
    </div>
  );
};

const PlaceReading = ({ reading, disabled, onPlace }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const place = async () => {
    if (busy || disabled || !reading.id) return;
    setBusy(true);
    setError('');
    try {
      await onPlace(reading.id);
    } catch (_err) {
      setError('That reading did not sit beside the question.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="concept-share-modal__note" data-testid={`question-share-waiting-${reading.id}`}>
      <p className="concept-share-modal__waiting-by">{reading.by}</p>
      <p className="concept-share-modal__waiting-text">{reading.text}</p>
      {asLine(reading.remainder) ? (
        <p className="muted small">Still holds: {asLine(reading.remainder)}</p>
      ) : null}
      <p className="muted small">{QUESTION_SHARE_PLACE}</p>
      {error ? <p className="status-message error-message">{error}</p> : null}
      <Button type="button" variant="secondary" onClick={place} disabled={disabled || busy}>
        {busy ? 'Placing…' : 'Let this sit beside the question'}
      </Button>
    </article>
  );
};

const ShareBrief = ({ brief, disabled, onSave }) => {
  const [agreement, setAgreement] = useState(asLine(brief?.agreement));
  const [remainder, setRemainder] = useState(asLine(brief?.remainder));
  const [observation, setObservation] = useState(asLine(brief?.observation));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAgreement(asLine(brief?.agreement));
    setRemainder(asLine(brief?.remainder));
    setObservation(asLine(brief?.observation));
  }, [brief?.agreement, brief?.remainder, brief?.observation]);

  const save = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      await onSave({
        agreement: asLine(agreement),
        remainder: asLine(remainder),
        observation: asLine(observation)
      });
    } catch (_err) {
      setError('That brief did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="concept-share-modal__note" data-testid="question-share-brief-form">
      <label className="concept-share-modal__label" htmlFor="question-share-brief-agreement">
        {QUESTION_SHARE_AGREEMENT}
      </label>
      <textarea
        id="question-share-brief-agreement"
        className="concept-share-modal__correction"
        value={agreement}
        maxLength={400}
        rows={3}
        onChange={(event) => setAgreement(event.target.value)}
        disabled={disabled || busy}
      />
      <label className="concept-share-modal__label" htmlFor="question-share-brief-remainder">
        {QUESTION_SHARE_OWNER_REMAINDER}
      </label>
      <textarea
        id="question-share-brief-remainder"
        className="concept-share-modal__correction"
        value={remainder}
        maxLength={400}
        rows={3}
        onChange={(event) => setRemainder(event.target.value)}
        disabled={disabled || busy}
      />
      <label className="concept-share-modal__label" htmlFor="question-share-brief-observation">
        {QUESTION_SHARE_OBSERVATION}
      </label>
      <textarea
        id="question-share-brief-observation"
        className="concept-share-modal__correction"
        value={observation}
        maxLength={400}
        rows={3}
        onChange={(event) => setObservation(event.target.value)}
        disabled={disabled || busy}
      />
      <p className="muted small">{QUESTION_SHARE_BRIEF}</p>
      {error ? <p className="status-message error-message">{error}</p> : null}
      <Button type="button" variant="secondary" onClick={save} disabled={disabled || busy}>
        {busy ? 'Saving…' : 'Save this brief'}
      </Button>
    </div>
  );
};

const ShareSuccession = ({ succession, disabled, onSave }) => {
  const handed = Boolean(asLine(succession?.unresolved));
  const [outcome, setOutcome] = useState(asLine(succession?.outcome));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOutcome(asLine(succession?.outcome));
  }, [succession?.outcome]);

  const save = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      await onSave({ outcome: asLine(outcome) });
    } catch (_err) {
      setError('That handoff did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="concept-share-modal__note" data-testid="question-share-succession-form">
      <label className="concept-share-modal__label" htmlFor="question-share-succession-outcome">
        {QUESTION_SHARE_OUTCOME}
      </label>
      <textarea
        id="question-share-succession-outcome"
        className="concept-share-modal__correction"
        value={outcome}
        maxLength={400}
        rows={3}
        onChange={(event) => setOutcome(event.target.value)}
        disabled={disabled || busy}
      />
      <p className="muted small">{QUESTION_SHARE_HAND}</p>
      {error ? <p className="status-message error-message">{error}</p> : null}
      <Button type="button" variant="secondary" onClick={save} disabled={disabled || busy}>
        {busy ? 'Saving…' : handed ? 'Save what happened later' : 'Hand this on'}
      </Button>
    </div>
  );
};

const ShareMandate = ({ mandate, ownerName, disabled, onSave, onEnd }) => {
  const live = mandate?.status === 'live';
  const [owner, setOwner] = useState(asLine(mandate?.owner) || asLine(ownerName));
  const [scope, setScope] = useState(asLine(mandate?.scope) || 'This published question.');
  const [tools, setTools] = useState(asLine(mandate?.tools) || AGENT_MANDATE_TOOLS);
  const [budget, setBudget] = useState(String(mandate?.budget?.asks || 3));
  const [stop, setStop] = useState(asLine(mandate?.stop));
  const [review, setReview] = useState(asLine(mandate?.review));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (live) return;
    setOwner(asLine(mandate?.owner) || asLine(ownerName));
    setScope(asLine(mandate?.scope) || 'This published question.');
    setTools(asLine(mandate?.tools) || AGENT_MANDATE_TOOLS);
    setBudget(String(mandate?.budget?.asks || 3));
    setStop(asLine(mandate?.stop));
    setReview(asLine(mandate?.review));
  }, [live, mandate, ownerName]);

  const save = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      await onSave({
        owner: asLine(owner),
        scope: asLine(scope),
        tools: asLine(tools),
        budget: Number(budget),
        stop: asLine(stop),
        review: asLine(review)
      });
    } catch (_err) {
      setError('That assignment did not save.');
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      await onEnd();
    } catch (_err) {
      setError('That assignment did not end.');
    } finally {
      setBusy(false);
    }
  };

  if (live) {
    return (
      <div className="concept-share-modal__note" data-testid="question-share-mandate-form">
        <p className="muted small">{QUESTION_SHARE_MANDATE}</p>
        {error ? <p className="status-message error-message">{error}</p> : null}
        <Button type="button" variant="secondary" onClick={end} disabled={disabled || busy}>
          {busy ? 'Saving…' : QUESTION_SHARE_END_MANDATE}
        </Button>
      </div>
    );
  }

  return (
    <div className="concept-share-modal__note" data-testid="question-share-mandate-form">
      <label className="concept-share-modal__label" htmlFor="question-share-mandate-owner">
        {QUESTION_SHARE_OWNER}
      </label>
      <input
        id="question-share-mandate-owner"
        className="concept-share-modal__url"
        value={owner}
        maxLength={80}
        onChange={(event) => setOwner(event.target.value)}
        disabled={disabled || busy}
      />
      <label className="concept-share-modal__label" htmlFor="question-share-mandate-scope">
        {QUESTION_SHARE_SCOPE}
      </label>
      <textarea
        id="question-share-mandate-scope"
        className="concept-share-modal__correction"
        value={scope}
        maxLength={400}
        rows={2}
        onChange={(event) => setScope(event.target.value)}
        disabled={disabled || busy}
      />
      <label className="concept-share-modal__label" htmlFor="question-share-mandate-tools">
        {QUESTION_SHARE_TOOLS}
      </label>
      <textarea
        id="question-share-mandate-tools"
        className="concept-share-modal__correction"
        value={tools}
        maxLength={400}
        rows={2}
        onChange={(event) => setTools(event.target.value)}
        disabled={disabled || busy}
      />
      <label className="concept-share-modal__label" htmlFor="question-share-mandate-budget">
        {QUESTION_SHARE_BUDGET}
      </label>
      <input
        id="question-share-mandate-budget"
        className="concept-share-modal__url"
        type="number"
        min={1}
        max={20}
        value={budget}
        onChange={(event) => setBudget(event.target.value)}
        disabled={disabled || busy}
      />
      <label className="concept-share-modal__label" htmlFor="question-share-mandate-stop">
        {QUESTION_SHARE_STOP}
      </label>
      <textarea
        id="question-share-mandate-stop"
        className="concept-share-modal__correction"
        value={stop}
        maxLength={400}
        rows={2}
        onChange={(event) => setStop(event.target.value)}
        disabled={disabled || busy}
      />
      <label className="concept-share-modal__label" htmlFor="question-share-mandate-review">
        {QUESTION_SHARE_REVIEW_ROUTE}
      </label>
      <textarea
        id="question-share-mandate-review"
        className="concept-share-modal__correction"
        value={review}
        maxLength={400}
        rows={2}
        onChange={(event) => setReview(event.target.value)}
        disabled={disabled || busy}
      />
      <p className="muted small">{QUESTION_SHARE_MANDATE}</p>
      {error ? <p className="status-message error-message">{error}</p> : null}
      <Button type="button" variant="secondary" onClick={save} disabled={disabled || busy}>
        {busy ? 'Saving…' : QUESTION_SHARE_NAME_MANDATE}
      </Button>
    </div>
  );
};

const ShareRecords = ({
  snapshot,
  slug,
  canTake = false,
  disabled,
  onBring
}) => {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');

  const take = () => {
    if (!canTake || busy || disabled) return;
    downloadQuestionShareRecords(snapshot, slug);
  };

  const bring = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy || disabled) return;
    setBusy(true);
    setError('');
    setReceipt('');
    try {
      const markdown = await file.text();
      const data = await onBring(markdown);
      setReceipt(shareRecordReceipt(data?.records) || 'Those records returned.');
    } catch (err) {
      setError(err?.response?.data?.error || 'Those records did not return.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="concept-share-modal__note" data-testid="question-share-records-form">
      <p className="muted small">{QUESTION_SHARE_RECORDS_HINT}</p>
      {error ? <p className="status-message error-message">{error}</p> : null}
      {receipt ? <p className="muted small" role="status">{receipt}</p> : null}
      <div className="concept-share-modal__actions">
        {canTake ? (
          <Button type="button" variant="secondary" onClick={take} disabled={disabled || busy}>
            {QUESTION_SHARE_TAKE_RECORDS}
          </Button>
        ) : null}
        <QuietButton
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || busy}
        >
          {busy ? 'Returning…' : QUESTION_SHARE_BRING_RECORDS}
        </QuietButton>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.json,text/markdown,application/json"
          hidden
          aria-label={QUESTION_SHARE_BRING_RECORDS}
          onChange={bring}
        />
      </div>
    </div>
  );
};

const ShareIncludesList = () => (
  <ul className="concept-share-modal__includes" aria-label="What's included">
    <li>
      <span className="concept-share-modal__includes-icon" aria-hidden="true">✓</span>
      Question text and authored paragraph blocks
    </li>
    <li>
      <span className="concept-share-modal__includes-icon" aria-hidden="true">✓</span>
      A later reading sits beside this question once you place it, not inside it
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
  const [conflict, setConflict] = useState('');
  const here = useQuestionPresence(state.slug, {
    enabled: open && Boolean(state.shared && state.slug),
    seed: state.here
  });

  useEffect(() => {
    if (!open || !questionId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setCopyStatus('');
    setCorrection('');
    setConflict('');
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
    setConflict('');
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
    setConflict('');
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

  const refreshShare = async () => {
    const data = await getQuestionShare(questionId);
    setState(data || { shared: false });
  };

  const handleTake = async (contributionId, interpretation, updatedAt) => {
    try {
      const data = await interpretQuestionContribution(questionId, contributionId, {
        interpretation,
        ...(asLine(updatedAt) ? { updatedAt: asLine(updatedAt) } : {})
      });
      setState(data);
      setConflict('');
    } catch (err) {
      const line = conflictLineOf(err);
      if (!line) throw err;
      setConflict(line);
      try {
        await refreshShare();
      } catch (_refresh) {
        // The collision line is the receipt; a refresh failure does not replace it.
      }
    }
  };

  const handlePlace = async (contributionId) => {
    try {
      const data = await placeQuestionContribution(questionId, contributionId);
      setState(data);
      setConflict('');
    } catch (err) {
      const line = conflictLineOf(err);
      if (!line) throw err;
      setConflict(line);
      try {
        await refreshShare();
      } catch (_refresh) {
        // The collision line is the receipt; a refresh failure does not replace it.
      }
    }
  };

  const handleBrief = async (brief) => {
    const data = await saveQuestionShareBrief(questionId, brief);
    setState(data);
  };

  const handleSuccession = async (succession) => {
    const data = await saveQuestionShareSuccession(questionId, succession);
    setState(data);
  };

  const handleMandate = async (fields) => {
    const data = await saveQuestionShareMandate(questionId, fields);
    setState(data);
  };

  const handleMandateEnd = async () => {
    const data = await saveQuestionShareMandate(questionId, { end: true });
    setState(data);
  };

  const handleBringRecords = async (markdown) => {
    const data = await importQuestionShareRecords(questionId, { markdown });
    setState(data);
    return data;
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
  const readings = Array.isArray(state.contributions) ? state.contributions : [];
  const waiting = Array.isArray(state.waiting) ? state.waiting : [];
  const brief = state.brief && typeof state.brief === 'object' ? state.brief : null;
  const publicBrief = brief && (asLine(brief.agreement) || asLine(brief.remainder) || asLine(brief.observation))
    ? brief
    : undefined;
  const succession = state.succession && typeof state.succession === 'object' ? state.succession : null;
  const publicSuccession = succession && asLine(succession.unresolved) ? succession : undefined;
  const mandate = state.mandate && typeof state.mandate === 'object' ? state.mandate : null;
  const publicMandate = mandate && asLine(mandate.owner) && asLine(mandate.scope) ? mandate : undefined;
  const canHand = Boolean(
    publicBrief && (asLine(publicBrief.remainder) || asLine(publicBrief.observation))
  );
  const readerView = reader?.question
    ? {
      ...reader,
      contributions: readings,
      yours: undefined,
      brief: publicBrief,
      succession: publicSuccession,
      mandate: publicMandate
    }
    : reader;
  const presence = questionPresenceLine(here);

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
            {readerView?.question ? (
              <div className="concept-share-modal__reader" data-testid="question-share-preview">
                <p className="concept-share-modal__reader-label">What a reader will see</p>
                <QuestionShareView snapshot={readerView} compact />
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
            {state.shared && waiting.length ? (
              <div className="concept-share-modal__takes" data-testid="question-share-waiting">
                {waiting.map((reading) => (
                  <PlaceReading
                    key={reading.id || reading.by}
                    reading={reading}
                    disabled={busy}
                    onPlace={handlePlace}
                  />
                ))}
              </div>
            ) : null}
            {state.shared && readings.length ? (
              <div className="concept-share-modal__takes" data-testid="question-share-takes">
                {readings.map((reading) => (
                  <TakeReading
                    key={reading.id || reading.by}
                    reading={reading}
                    disabled={busy}
                    onSave={handleTake}
                  />
                ))}
              </div>
            ) : null}
            {state.shared && readings.length ? (
              <ShareBrief brief={brief} disabled={busy} onSave={handleBrief} />
            ) : null}
            {state.shared && (canHand || publicSuccession) ? (
              <ShareSuccession
                succession={succession}
                disabled={busy}
                onSave={handleSuccession}
              />
            ) : null}
            {state.shared ? (
              <ShareMandate
                mandate={mandate}
                ownerName={state.ownerDisplayName}
                disabled={busy}
                onSave={handleMandate}
                onEnd={handleMandateEnd}
              />
            ) : null}
            {state.shared ? (
              <ShareRecords
                snapshot={readerView}
                slug={state.slug}
                canTake={Boolean(publicSuccession || publicMandate)}
                disabled={busy}
                onBring={handleBringRecords}
              />
            ) : null}
            {conflict ? (
              <p className="muted small" role="status" data-testid="question-share-conflict">
                {conflict}
              </p>
            ) : null}
            {presence ? (
              <p className="muted small" role="status" aria-live="polite" data-testid="question-share-presence">
                {presence}
              </p>
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
