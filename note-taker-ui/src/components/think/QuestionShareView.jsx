import React, { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { QUESTION_SHARE_COLOPHON, QUESTION_SHARE_OFFER } from './thinkShareFixture';

const asLine = (value) => String(value || '').trim();

const formatPublished = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const readingsOf = (snapshot) => (
  Array.isArray(snapshot?.contributions)
    ? snapshot.contributions.filter((item) => asLine(item?.by) && asLine(item?.text))
    : []
);

const OfferReading = ({ onOffer }) => {
  const reduced = usePrefersReducedMotion();
  const nameRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [by, setBy] = useState('');
  const [text, setText] = useState('');
  const [remainder, setRemainder] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open || reduced) return undefined;
    nameRef.current?.focus();
    return undefined;
  }, [open, reduced]);

  if (sent) {
    return (
      <p className="think-share-view__offer-receipt" role="status">
        It is on this page, beside the question.
      </p>
    );
  }

  const send = async () => {
    if (!asLine(by) || !asLine(text) || busy) return;
    setBusy(true);
    setError('');
    try {
      await onOffer({ by: asLine(by), text: asLine(text), remainder: asLine(remainder) });
      setSent(true);
      setOpen(false);
    } catch (_offerError) {
      setError('That reading did not send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="think-share-view__offer" data-testid="question-share-offer">
      {open ? (
        <>
          <label className="think-share-view__offer-label" htmlFor="question-share-offer-by">
            Your name
          </label>
          <input
            id="question-share-offer-by"
            ref={nameRef}
            className="think-share-view__offer-field"
            value={by}
            maxLength={80}
            autoComplete="name"
            onChange={(event) => setBy(event.target.value)}
          />
          <label className="think-share-view__offer-label" htmlFor="question-share-offer-text">
            What you bring
          </label>
          <textarea
            id="question-share-offer-text"
            className="think-share-view__offer-field"
            value={text}
            maxLength={800}
            rows={4}
            onChange={(event) => setText(event.target.value)}
          />
          <label className="think-share-view__offer-label" htmlFor="question-share-offer-remainder">
            What you still hold
          </label>
          <textarea
            id="question-share-offer-remainder"
            className="think-share-view__offer-field"
            value={remainder}
            maxLength={400}
            rows={3}
            onChange={(event) => setRemainder(event.target.value)}
          />
          <p className="think-share-view__offer-hint">{QUESTION_SHARE_OFFER}</p>
          {error ? <p className="think-share-view__offer-error" role="status">{error}</p> : null}
          <div className="think-share-view__offer-actions">
            <button type="button" onClick={send} disabled={busy || !asLine(by) || !asLine(text)}>
              {busy ? 'Sending…' : 'Offer this reading'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(''); }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Offer a reading
        </button>
      )}
    </div>
  );
};

const Reading = ({ reading }) => {
  const when = formatPublished(reading.createdAt);
  return (
    <article className="think-share-view__reading" data-testid="question-share-reading">
      <p className="think-share-view__reading-by">{reading.by}</p>
      <p>{reading.text}</p>
      {asLine(reading.remainder) ? (
        <p className="think-share-view__remainder">Still holds: {asLine(reading.remainder)}</p>
      ) : null}
      {when ? <p className="think-share-view__by">{when}</p> : null}
    </article>
  );
};

export default function QuestionShareView({
  snapshot,
  compact = false,
  onOffer = null
}) {
  if (!snapshot) return null;
  const question = snapshot.question || {};
  const paragraphs = Array.isArray(question.paragraphs)
    ? question.paragraphs.filter((block) => block?.text)
    : [];
  const when = formatPublished(snapshot.publishedAt);
  const revised = formatPublished(snapshot.revisedAt);
  const showRevised = Boolean(revised && revised !== when);
  const correction = String(snapshot.correction || '').trim();
  const conceptName = String(question.conceptName || '').trim();
  const by = snapshot.ownerDisplayName
    ? (when ? `Shared by ${snapshot.ownerDisplayName} · ${when}` : `Shared by ${snapshot.ownerDisplayName}`)
    : when;
  const readings = readingsOf(snapshot);
  const invite = compact ? null : onOffer;

  return (
    <article
      className={['think-share-view', compact ? 'is-compact' : ''].filter(Boolean).join(' ')}
      data-testid="question-share-view"
    >
      <header className="think-share-view__header">
        <p className="think-share-view__eyebrow">Shared question</p>
        <h1 className="think-share-view__title">{question.text || 'Untitled question'}</h1>
        {by ? <p className="think-share-view__by">{by}</p> : null}
        {conceptName || question.status ? (
          <p className="think-share-view__meta">
            {[conceptName, question.status].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {showRevised ? <p className="think-share-view__revised">Updated {revised}</p> : null}
        {correction ? <p className="think-share-view__correction">{correction}</p> : null}
      </header>
      {paragraphs.length ? (
        <section className="think-share-view__body">
          {paragraphs.map((block) => (
            <p key={block.id || block.text}>{block.text}</p>
          ))}
        </section>
      ) : (
        <p className="think-share-view__silence">This question was shared before it was fully answered.</p>
      )}
      {readings.length ? (
        <section className="think-share-view__readings" data-testid="question-share-readings">
          <p className="think-share-view__section">
            {readings.length === 1 ? 'Another reading' : 'Other readings'}
          </p>
          {readings.map((reading, index) => (
            <Reading key={reading.id || `${reading.by}-${index}`} reading={reading} />
          ))}
        </section>
      ) : null}
      {invite ? <OfferReading onOffer={invite} /> : null}
      {compact ? null : <p className="think-share-view__colophon">{QUESTION_SHARE_COLOPHON}</p>}
    </article>
  );
}
