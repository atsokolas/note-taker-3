import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicQuestion } from '../api/questions';
import { buildSharePreviewReceipt } from '../utils/connectionMagicMoment';

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch (_err) {
    return '';
  }
};

const useDocumentTitle = (title) => {
  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
};

const useDocumentMeta = (name, content, attr = 'name') => {
  useEffect(() => {
    if (typeof document === 'undefined' || !content) return undefined;
    let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
    const created = !tag;
    const previousContent = tag?.getAttribute('content') || '';
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(attr, name);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
    return () => {
      if (created) {
        tag?.remove();
      } else {
        tag?.setAttribute('content', previousContent);
      }
    };
  }, [name, content, attr]);
};

const SharedQuestionTopBar = ({ minimal = false, onCopy, copyState, pageUrl }) => (
  <div className="shared-concept-topbar" data-testid="shared-question-topbar">
    <Link to="/" className="shared-concept-topbar__brand" aria-label="Noeis home">
      <span className="shared-concept-topbar__brand-mark" aria-hidden="true" />
      <span className="shared-concept-topbar__brand-name">Noeis</span>
    </Link>
    {!minimal && pageUrl ? (
      <div className="shared-concept-topbar__actions">
        <button
          type="button"
          className="shared-concept-topbar__copy"
          onClick={onCopy}
          data-testid="shared-question-copy"
        >
          {copyState === 'copied' ? 'Link copied' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
        </button>
        <Link to="/" className="shared-concept-topbar__cta">
          Open Noeis
        </Link>
      </div>
    ) : null}
  </div>
);

const SharedQuestion = () => {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState('idle');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    getPublicQuestion(slug)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        setError(status === 404
          ? 'This shared question does not exist or was revoked.'
          : err?.response?.data?.error || 'Failed to load shared question.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const question = data?.question || {};
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const title = question.text || 'Shared question';
  const ownerLine = data?.ownerDisplayName ? `Shared by ${data.ownerDisplayName}` : 'Shared via Noeis';
  const conceptName = String(question.conceptName || '').trim();
  const answerBlocks = useMemo(() => (
    Array.isArray(question.paragraphs) ? question.paragraphs.filter((block) => block?.text) : []
  ), [question.paragraphs]);
  const description = (
    answerBlocks[0]?.text
    || (conceptName ? `An open question about ${conceptName}.` : 'A question shared from Noeis.')
  ).slice(0, 220);

  useDocumentTitle(data ? `${title} · Noeis` : 'Shared question · Noeis');
  useDocumentMeta('description', description);
  useDocumentMeta('og:title', title, 'property');
  useDocumentMeta('og:description', description, 'property');
  useDocumentMeta('og:type', 'article', 'property');
  useDocumentMeta('og:url', pageUrl, 'property');
  useDocumentMeta('og:site_name', 'Noeis', 'property');
  useDocumentMeta('twitter:card', 'summary');
  useDocumentMeta('twitter:title', title);
  useDocumentMeta('twitter:description', description);

  const handleCopy = async () => {
    if (!pageUrl) return;
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2400);
    } catch (_error) {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2400);
    }
  };

  if (loading) {
    return (
      <div className="shared-concept-page shared-concept-page--loading">
        <SharedQuestionTopBar minimal />
        <p className="muted small">Loading shared question...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-concept-page shared-concept-page--error">
        <SharedQuestionTopBar minimal />
        <h1 className="shared-concept-page__error-title">Not available</h1>
        <p className="muted">{error}</p>
        <p>
          <Link to="/" className="shared-concept-page__home-link">Back to Noeis</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="shared-concept-page shared-question-page" data-testid="shared-question-page">
      <SharedQuestionTopBar onCopy={handleCopy} copyState={copyState} pageUrl={pageUrl} />

      <header className="shared-concept-page__header">
        <span className="shared-concept-page__eyebrow">Shared question</span>
        <h1 className="shared-concept-page__title">{title}</h1>
        <p className="shared-concept-page__description">
          {buildSharePreviewReceipt()}
        </p>
        <p className="shared-concept-page__meta muted small">
          {ownerLine}
          {data?.sharedAt ? <> · {formatDate(data.sharedAt)}</> : null}
          {conceptName ? <> · {conceptName}</> : null}
          {question.status ? <> · {question.status}</> : null}
        </p>
      </header>

      {answerBlocks.length > 0 ? (
        <section className="shared-concept-page__hypothesis">
          <h2 className="shared-concept-page__section-title">Answer notes</h2>
          <div className="shared-concept-page__prose">
            {answerBlocks.map((block) => (
              <p key={block.id || block.text}>{block.text}</p>
            ))}
          </div>
        </section>
      ) : (
        <section className="shared-concept-page__hypothesis">
          <h2 className="shared-concept-page__section-title">Still open</h2>
          <p className="shared-concept-page__prose">
            This question has been shared before it was fully answered.
          </p>
        </section>
      )}

      <footer className="shared-concept-page__footer">
        <p className="muted small">
          Built in <Link to="/" className="shared-concept-page__home-link">Noeis</Link> — a thinking workspace for serious readers.
        </p>
      </footer>
    </div>
  );
};

export default SharedQuestion;
