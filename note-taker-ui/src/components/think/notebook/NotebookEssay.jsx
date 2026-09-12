import React from 'react';
import { ACCESS_WITHHELD } from './notebookShareFixture';
import './notebookShare.css';

const formatPublished = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const SourceLine = ({ source }) => {
  if (!source?.title && !source?.href) return null;
  const withheld = source.access === 'withheld' || !source.href;
  if (withheld) {
    return (
      <cite className="notebook-essay__source">
        {source.title ? `${source.title}. ` : ''}
        {ACCESS_WITHHELD}
      </cite>
    );
  }
  return (
    <cite className="notebook-essay__source">
      <a href={source.href} rel="noopener noreferrer">{source.title || source.href}</a>
    </cite>
  );
};

const namedKind = (type) => {
  if (type === 'concept') return 'Concept';
  if (type === 'question') return 'Question';
  if (type === 'wiki') return 'Wiki';
  return '';
};

const EssayBlock = ({ block }) => {
  const type = block?.type;
  if (type === 'heading') {
    const level = Math.min(Math.max(Number(block.level) || 2, 2), 4);
    const Tag = `h${level}`;
    return <Tag className="notebook-essay__heading">{block.text}</Tag>;
  }
  if (type === 'bullet') {
    return (
      <p className="notebook-essay__bullet" style={{ '--indent': String(block.indent || 0) }}>
        {block.text}
      </p>
    );
  }
  if (type === 'quote') {
    return (
      <blockquote className="notebook-essay__quote">
        {block.text ? <p>{block.text}</p> : null}
        <SourceLine source={block.source} />
      </blockquote>
    );
  }
  if (type === 'article') {
    return (
      <p className="notebook-essay__article">
        <SourceLine source={block.source || { title: block.text, href: '', access: 'withheld' }} />
      </p>
    );
  }
  if (type === 'concept' || type === 'question' || type === 'wiki') {
    return (
      <p className="notebook-essay__name">
        <span className="notebook-essay__name-kind">{namedKind(type)}</span>
        {block.text}
      </p>
    );
  }
  if (type === 'code') {
    return (
      <pre className="notebook-essay__code">
        <code>{block.text}</code>
      </pre>
    );
  }
  if (type === 'divider') return <hr className="notebook-essay__rule" />;
  if (block?.text) return <p className="notebook-essay__prose">{block.text}</p>;
  return null;
};

export default function NotebookEssay({ snapshot, compact = false }) {
  if (!snapshot) return null;
  const when = formatPublished(snapshot.publishedAt);
  const by = snapshot.ownerDisplayName
    ? (when ? `Shared by ${snapshot.ownerDisplayName} · ${when}` : `Shared by ${snapshot.ownerDisplayName}`)
    : when;
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];

  return (
    <article
      className={['notebook-essay', compact ? 'is-compact' : ''].filter(Boolean).join(' ')}
      data-testid="notebook-essay"
    >
      <header className="notebook-essay__header">
        <p className="notebook-essay__eyebrow">Shared note</p>
        <h1 className="notebook-essay__title">{snapshot.title || 'Untitled'}</h1>
        {by ? <p className="notebook-essay__by">{by}</p> : null}
      </header>
      <div className="notebook-essay__body">
        {blocks.map((block, index) => (
          <EssayBlock key={block.id || `${block.type}-${index}`} block={block} />
        ))}
      </div>
    </article>
  );
}
