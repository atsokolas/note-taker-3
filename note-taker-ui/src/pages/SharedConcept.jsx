import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPublicConcept } from '../api/concepts';
import ConceptShareView from '../components/think/ConceptShareView';
import { CONCEPT_NOT_PUBLISHED } from '../components/think/thinkShareFixture';
import '../styles/shared-page-column.css';

const STICKY_REVEAL_PX = 240;

const stripHtml = (html = '') => {
  if (!html) return '';
  if (typeof document === 'undefined') return String(html);
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
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

const SharedConceptTopBar = ({ minimal = false, onCopy, copyState, pageUrl }) => (
  <div className="shared-concept-topbar" data-testid="shared-concept-topbar">
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
          data-testid="shared-concept-topbar-copy"
        >
          {copyState === 'copied' ? 'Link copied' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
        </button>
        <Link
          to="/"
          className="shared-concept-topbar__cta"
          data-testid="shared-concept-topbar-cta"
        >
          Open Noeis
        </Link>
      </div>
    ) : null}
  </div>
);

const SharedConcept = () => {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState('idle');
  const [stickyVisible, setStickyVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    getPublicConcept(slug)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.status === 404
          ? CONCEPT_NOT_PUBLISHED
          : err?.response?.data?.error || 'Failed to load shared concept.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    const onScroll = () => {
      setStickyVisible(window.scrollY > STICKY_REVEAL_PX);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const concept = useMemo(() => data?.concept || {}, [data]);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const conceptName = concept.name || 'Untitled concept';
  const ownerLine = data?.ownerDisplayName ? `Shared by ${data.ownerDisplayName}` : 'Shared via Noeis';
  const ogDescription = (
    concept.framing
    || concept.description
    || stripHtml(concept.hypothesisHtml).slice(0, 200)
    || 'A concept shared from Noeis — a thinking workspace for serious readers.'
  ).slice(0, 220);

  useDocumentTitle(data ? `${conceptName} · Noeis` : 'Shared concept · Noeis');
  useDocumentMeta('description', ogDescription);
  useDocumentMeta('og:title', conceptName, 'property');
  useDocumentMeta('og:description', ogDescription, 'property');
  useDocumentMeta('og:type', 'article', 'property');
  useDocumentMeta('og:url', pageUrl, 'property');
  useDocumentMeta('og:site_name', 'Noeis', 'property');
  useDocumentMeta('twitter:card', 'summary');
  useDocumentMeta('twitter:title', conceptName);
  useDocumentMeta('twitter:description', ogDescription);

  const handleCopy = async () => {
    if (!pageUrl) return;
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2400);
    } catch (_err) {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2400);
    }
  };

  if (loading) {
    return (
      <div className="shared-concept-page shared-concept-page--loading">
        <SharedConceptTopBar minimal />
        <p className="muted small">Loading shared concept…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-concept-page shared-concept-page--error">
        <SharedConceptTopBar minimal />
        <h1 className="shared-concept-page__error-title">Not available</h1>
        <p className="muted">{error}</p>
        <p>
          <Link to="/" className="shared-concept-page__home-link">Back to Noeis</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="shared-concept-page" data-testid="shared-concept-page">
      <SharedConceptTopBar onCopy={handleCopy} copyState={copyState} pageUrl={pageUrl} />
      <div
        className={`shared-concept-page__sticky-bar ${stickyVisible ? 'is-visible' : ''}`}
        aria-hidden={stickyVisible ? 'false' : 'true'}
      >
        <span className="shared-concept-page__sticky-title">{conceptName}</span>
        <span className="shared-concept-page__sticky-meta muted small">{ownerLine}</span>
        <button
          type="button"
          className="shared-concept-page__sticky-copy"
          onClick={handleCopy}
          data-testid="shared-concept-sticky-copy"
        >
          {copyState === 'copied' ? 'Link copied' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
        </button>
      </div>
      <ConceptShareView snapshot={data} />
    </div>
  );
};

export default SharedConcept;
