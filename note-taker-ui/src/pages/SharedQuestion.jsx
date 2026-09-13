import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicQuestion } from '../api/questions';
import QuestionShareView from '../components/think/QuestionShareView';
import { QUESTION_NOT_PUBLISHED } from '../components/think/thinkShareFixture';
import '../styles/shared-page-column.css';

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
        setError(err?.response?.status === 404
          ? QUESTION_NOT_PUBLISHED
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
  const description = (
    (Array.isArray(question.paragraphs) && question.paragraphs[0]?.text)
    || (question.conceptName ? `An open question about ${question.conceptName}.` : 'A question shared from Noeis.')
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
      <QuestionShareView snapshot={data} />
    </div>
  );
};

export default SharedQuestion;
