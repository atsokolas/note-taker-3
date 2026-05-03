import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPublicConcept } from '../api/concepts';

/**
 * SharedConcept — public read-only view of a concept.
 *
 * Mounted at /share/concepts/:slug, no auth required. Renders a stripped
 * snapshot: framing, hypothesis, support / tension cards, open questions,
 * concept note. No editor, no agent, no sidebar — just the thinking.
 *
 * Polish in this iteration:
 *  - Real top header with Noeis brand, copy-link, and "Open Noeis" CTA so
 *    the page feels like a destination, not a leaked partial.
 *  - <head> tags managed imperatively (document.title + og:* + twitter:*)
 *    so link previews on Slack / Twitter / iMessage render branded — no
 *    react-helmet dependency for one page.
 *  - Sticky attribution bar fades in once the header scrolls out so
 *    readers always see who shared this and have copy/open actions in
 *    reach. Hidden in reduced-motion as a hard cut.
 *  - Read-time estimate (220 wpm) from the visible text content.
 *  - Two-column card grid for Support / Tension on wide screens.
 */

const READING_WPM = 220;
const STICKY_REVEAL_PX = 240;

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

const stripHtml = (html = '') => {
  if (!html) return '';
  if (typeof document === 'undefined') return String(html);
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

// Set / clear named meta tags. Imperative because we have one public route
// and don't want to pull in react-helmet for it. Returns a cleanup that
// restores prior values so the SPA doesn't pollute other routes.
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

const Card = ({ card, kind }) => (
  <article className={`shared-concept__card shared-concept__card--${kind}`}>
    <header>
      <span className="shared-concept__card-eyebrow">{kind === 'support' ? 'Support' : kind === 'tension' ? 'Tension' : 'Question'}</span>
      {card.source ? <span className="shared-concept__card-source">{card.source}</span> : null}
    </header>
    {card.title ? <h4 className="shared-concept__card-title">{card.title}</h4> : null}
    {card.content ? <p className="shared-concept__card-content">{card.content}</p> : null}
    {card.whyItMatters ? <p className="shared-concept__card-why"><em>{card.whyItMatters}</em></p> : null}
  </article>
);

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
  const [copyState, setCopyState] = useState('idle'); // idle | copied | error
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
        const status = err?.response?.status;
        if (status === 404) {
          setError('This shared concept doesn\'t exist or was revoked.');
        } else {
          setError(err?.response?.data?.error || 'Failed to load shared concept.');
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Reveal sticky attribution bar once visitor has scrolled past the hero.
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

  // Memoize derived arrays so dependent useMemo (read-time) has stable deps.
  // Without this, eslint flags the read-time hook as having "logical-expression
  // dependencies that change every render".
  const concept = useMemo(() => data?.concept || {}, [data]);
  const supports = useMemo(() => concept.supports || [], [concept]);
  const contradictions = useMemo(() => concept.contradictions || [], [concept]);
  const questions = useMemo(() => concept.questions || [], [concept]);

  const readMinutes = useMemo(() => {
    const text = [
      stripHtml(concept.hypothesisHtml),
      concept.framing,
      concept.description,
      ...supports.map((c) => `${c.title || ''} ${c.content || ''} ${c.whyItMatters || ''}`),
      ...contradictions.map((c) => `${c.title || ''} ${c.content || ''} ${c.whyItMatters || ''}`),
      ...questions.map((c) => `${c.title || ''} ${c.content || ''}`),
      stripHtml(concept.note?.content)
    ].join(' ').trim();
    if (!text) return 0;
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / READING_WPM));
  }, [concept, supports, contradictions, questions]);

  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const conceptName = concept.name || 'Untitled concept';
  const ownerLine = data?.ownerDisplayName ? `Shared by ${data.ownerDisplayName}` : 'Shared via Noeis';
  const ogDescription = (
    concept.framing
    || concept.description
    || stripHtml(concept.hypothesisHtml).slice(0, 200)
    || 'A concept shared from Noeis — a thinking workspace for serious readers.'
  ).slice(0, 220);

  // Document head — branded link previews. Hooks always called; the inner
  // effect bails when content is empty so we don't blank existing tags.
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

      <header className="shared-concept-page__header">
        <span className="shared-concept-page__eyebrow">Shared concept</span>
        <h1 className="shared-concept-page__title">{conceptName}</h1>
        {concept.framing ? (
          <p className="shared-concept-page__framing">{concept.framing}</p>
        ) : null}
        {concept.description ? (
          <p className="shared-concept-page__description">{concept.description}</p>
        ) : null}
        <p className="shared-concept-page__meta muted small">
          {ownerLine}
          {data?.sharedAt ? <> · {formatDate(data.sharedAt)}</> : null}
          {readMinutes ? <> · {readMinutes} min read</> : null}
        </p>
      </header>

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

      {concept.hypothesisHtml ? (
        <section className="shared-concept-page__hypothesis">
          <h2 className="shared-concept-page__section-title">Working hypothesis</h2>
          <div
            className="shared-concept-page__prose"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: concept.hypothesisHtml }}
          />
        </section>
      ) : null}

      {supports.length > 0 ? (
        <section className="shared-concept-page__group">
          <h2 className="shared-concept-page__section-title">Support</h2>
          <div className="shared-concept-page__cards shared-concept-page__cards--grid">
            {supports.map((card) => <Card key={card.id} card={card} kind="support" />)}
          </div>
        </section>
      ) : null}

      {contradictions.length > 0 ? (
        <section className="shared-concept-page__group">
          <h2 className="shared-concept-page__section-title">Tension</h2>
          <div className="shared-concept-page__cards shared-concept-page__cards--grid">
            {contradictions.map((card) => <Card key={card.id} card={card} kind="tension" />)}
          </div>
        </section>
      ) : null}

      {questions.length > 0 ? (
        <section className="shared-concept-page__group">
          <h2 className="shared-concept-page__section-title">Open questions</h2>
          <div className="shared-concept-page__cards">
            {questions.map((card) => <Card key={card.id} card={card} kind="question" />)}
          </div>
        </section>
      ) : null}

      {concept.note?.content ? (
        <section className="shared-concept-page__note">
          <h2 className="shared-concept-page__section-title">Concept note</h2>
          {concept.note.title ? <h3>{concept.note.title}</h3> : null}
          <div
            className="shared-concept-page__prose"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: concept.note.content }}
          />
        </section>
      ) : null}

      <footer className="shared-concept-page__footer">
        <p className="muted small">
          Built in <Link to="/" className="shared-concept-page__home-link">Noeis</Link> — a thinking workspace for serious readers.
        </p>
      </footer>
    </div>
  );
};

export default SharedConcept;
