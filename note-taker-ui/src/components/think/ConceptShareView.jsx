import React from 'react';
import { CONCEPT_SHARE_COLOPHON } from './thinkShareFixture';

const formatPublished = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const Card = ({ card, kind }) => (
  <article className={`shared-concept__card shared-concept__card--${kind}`}>
    <header>
      <span className="shared-concept__card-eyebrow">
        {kind === 'support' ? 'Support' : kind === 'tension' ? 'Tension' : 'Question'}
      </span>
    </header>
    {card.title ? <h4 className="shared-concept__card-title">{card.title}</h4> : null}
    {card.content ? <p className="shared-concept__card-content">{card.content}</p> : null}
    {card.whyItMatters ? <p className="shared-concept__card-why"><em>{card.whyItMatters}</em></p> : null}
  </article>
);

export default function ConceptShareView({ snapshot, compact = false }) {
  if (!snapshot) return null;
  const concept = snapshot.concept || {};
  const supports = Array.isArray(concept.supports) ? concept.supports : [];
  const contradictions = Array.isArray(concept.contradictions) ? concept.contradictions : [];
  const questions = Array.isArray(concept.questions) ? concept.questions : [];
  const when = formatPublished(snapshot.publishedAt);
  const revised = formatPublished(snapshot.revisedAt);
  const showRevised = Boolean(revised && revised !== when);
  const correction = String(snapshot.correction || '').trim();
  const by = snapshot.ownerDisplayName
    ? (when ? `Shared by ${snapshot.ownerDisplayName} · ${when}` : `Shared by ${snapshot.ownerDisplayName}`)
    : when;

  return (
    <article
      className={['think-share-view', compact ? 'is-compact' : ''].filter(Boolean).join(' ')}
      data-testid="concept-share-view"
    >
      <header className="think-share-view__header">
        <p className="think-share-view__eyebrow">Shared concept</p>
        <h1 className="think-share-view__title">{concept.name || 'Untitled concept'}</h1>
        {concept.framing ? <p className="think-share-view__framing">{concept.framing}</p> : null}
        {concept.description ? <p className="think-share-view__description">{concept.description}</p> : null}
        {by ? <p className="think-share-view__by">{by}</p> : null}
        {showRevised ? <p className="think-share-view__revised">Updated {revised}</p> : null}
        {correction ? <p className="think-share-view__correction">{correction}</p> : null}
      </header>
      {concept.hypothesisHtml ? (
        <section className="think-share-view__body">
          <h2 className="think-share-view__section">Working hypothesis</h2>
          <div
            className="think-share-view__prose"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: concept.hypothesisHtml }}
          />
        </section>
      ) : null}
      {supports.length ? (
        <section className="think-share-view__group">
          <h2 className="think-share-view__section">Support</h2>
          <div className="shared-concept-page__cards shared-concept-page__cards--grid">
            {supports.map((card) => <Card key={card.id || card.title} card={card} kind="support" />)}
          </div>
        </section>
      ) : null}
      {contradictions.length ? (
        <section className="think-share-view__group">
          <h2 className="think-share-view__section">Tension</h2>
          <div className="shared-concept-page__cards shared-concept-page__cards--grid">
            {contradictions.map((card) => <Card key={card.id || card.title} card={card} kind="tension" />)}
          </div>
        </section>
      ) : null}
      {questions.length ? (
        <section className="think-share-view__group">
          <h2 className="think-share-view__section">Open questions</h2>
          <div className="shared-concept-page__cards">
            {questions.map((card) => <Card key={card.id || card.title} card={card} kind="question" />)}
          </div>
        </section>
      ) : null}
      {compact ? null : <p className="think-share-view__colophon">{CONCEPT_SHARE_COLOPHON}</p>}
    </article>
  );
}
