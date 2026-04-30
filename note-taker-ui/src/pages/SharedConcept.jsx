import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPublicConcept } from '../api/concepts';

/**
 * SharedConcept — public read-only view of a concept.
 *
 * Mounted at /share/concepts/:slug, no auth required. Renders a stripped
 * snapshot: framing, hypothesis, support / tension cards, open questions,
 * concept note. No editor, no agent, no sidebar — just the thinking.
 */

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

const SharedConcept = () => {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (loading) {
    return (
      <div className="shared-concept-page shared-concept-page--loading">
        <p className="muted small">Loading shared concept…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-concept-page shared-concept-page--error">
        <h1 className="shared-concept-page__error-title">Not available</h1>
        <p className="muted">{error}</p>
        <p>
          <Link to="/" className="shared-concept-page__home-link">Back to Noeis</Link>
        </p>
      </div>
    );
  }

  const concept = data?.concept || {};
  const supports = concept.supports || [];
  const contradictions = concept.contradictions || [];
  const questions = concept.questions || [];

  return (
    <div className="shared-concept-page" data-testid="shared-concept-page">
      <header className="shared-concept-page__header">
        <span className="shared-concept-page__eyebrow">Shared concept</span>
        <h1 className="shared-concept-page__title">{concept.name || 'Untitled concept'}</h1>
        {concept.framing ? (
          <p className="shared-concept-page__framing">{concept.framing}</p>
        ) : null}
        {concept.description ? (
          <p className="shared-concept-page__description">{concept.description}</p>
        ) : null}
        <p className="shared-concept-page__meta muted small">
          {data?.ownerDisplayName ? (
            <>Shared by <strong>{data.ownerDisplayName}</strong></>
          ) : (
            <>Shared</>
          )}
          {data?.sharedAt ? <> · {formatDate(data.sharedAt)}</> : null}
        </p>
      </header>

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
          <div className="shared-concept-page__cards">
            {supports.map((card) => <Card key={card.id} card={card} kind="support" />)}
          </div>
        </section>
      ) : null}

      {contradictions.length > 0 ? (
        <section className="shared-concept-page__group">
          <h2 className="shared-concept-page__section-title">Tension</h2>
          <div className="shared-concept-page__cards">
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
