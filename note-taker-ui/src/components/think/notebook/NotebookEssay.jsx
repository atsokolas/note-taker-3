import React, { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import { ACCESS_WITHHELD } from './notebookShareFixture';
import './notebookShare.css';

const asLine = (value) => String(value || '').trim();

const publicHref = (value, access) => {
  if (access === 'withheld') return '';
  const raw = asLine(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hash = '';
    return url.toString();
  } catch (_error) {
    return '';
  }
};

const formatPublished = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// Exact quotation, recorded title, existing public door. No invented URL,
// private path, annotation, or marketing footer. Missing door stays missing.
export const quoteClip = (block = {}) => {
  const passage = asLine(block.text);
  if (!passage) return '';
  const source = block.source || {};
  const title = asLine(source.title);
  const href = publicHref(source.href, source.access);
  if (!title && !href) return '';
  return [`"${passage}"`, title && `— ${title}`, href].filter(Boolean).join('\n');
};

const SourceLine = ({ source }) => {
  if (!source?.title && !source?.href) return null;
  const href = publicHref(source.href, source.access);
  if (!href) {
    return (
      <cite className="notebook-essay__source">
        {source.title ? `${source.title}. ` : ''}
        {ACCESS_WITHHELD}
      </cite>
    );
  }
  return (
    <cite className="notebook-essay__source">
      <a href={href} rel="noopener noreferrer">{source.title || href}</a>
    </cite>
  );
};

const CopyWithSource = ({ clip }) => {
  const reduced = usePrefersReducedMotion();
  const fieldRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [selectHint, setSelectHint] = useState(false);

  useEffect(() => {
    if (!copied || reduced) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied, reduced]);

  useEffect(() => {
    if (!selectHint) return undefined;
    fieldRef.current?.focus();
    fieldRef.current?.select();
    return undefined;
  }, [selectHint]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(clip);
      setCopied(true);
      setSelectHint(false);
    } catch (_copyError) {
      setCopied(false);
      setSelectHint(true);
    }
  };

  return (
    <div className="notebook-essay__copy">
      <button type="button" onClick={copy}>
        {copied ? 'Copied.' : 'Copy with source'}
      </button>
      {selectHint ? (
        <textarea
          ref={fieldRef}
          className="notebook-essay__clip"
          readOnly
          value={clip}
          aria-label="Quotation with source"
          rows={3}
          onFocus={(event) => event.target.select()}
        />
      ) : null}
    </div>
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
    const clip = quoteClip(block);
    return (
      <blockquote className="notebook-essay__quote">
        {block.text ? <p>{block.text}</p> : null}
        <SourceLine source={block.source} />
        {clip ? <CopyWithSource clip={clip} /> : null}
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
