import React from 'react';
import { QUESTION_SHARE_COLOPHON } from './thinkShareFixture';

const formatPublished = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function QuestionShareView({ snapshot, compact = false }) {
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
      {compact ? null : <p className="think-share-view__colophon">{QUESTION_SHARE_COLOPHON}</p>}
    </article>
  );
}
