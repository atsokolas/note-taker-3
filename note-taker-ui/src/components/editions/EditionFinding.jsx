import React from 'react';
import { Link } from 'react-router-dom';
import { publicSourceHref } from '../../pages/editionModel';
import { findingAnchor } from './editionReadingState';

export const EditionBoundary = ({ children }) => (
  <aside className="reading-boundary">
    <span>Where this stops</span>
    <p>{children}</p>
  </aside>
);
export default function EditionFinding({ item, lead, busy, receipt, onAct, onPeek, onSelection }) {
  const href = publicSourceHref(item.url);
  return (
    <article
      className={`edition-finding${lead ? ' is-lead' : ''}`}
      id={findingAnchor(item.itemId)}
      data-reading-item={item.itemId}
      tabIndex={-1}
    >
      <h2>{item.title}</h2>
      <p className="reading-source">
        {[item.sourceLabel, item.sourceDate].filter(Boolean).join(' · ')}
      </p>
      <div
        className="reading-prose"
        data-finding-text={item.itemId}
        onMouseUp={onSelection}
        onKeyUp={onSelection}
      >
        <p>{item.finding}</p>
      </div>
      <EditionBoundary>{item.boundary}</EditionBoundary>
      {item.note ? <p className="reading-editorial-note">{item.note}</p> : null}
      <div className="reading-actions">
        <button onClick={(event) => onPeek(item, 'source', event.currentTarget)}>Source</button>
        {item.savedArticleId ? (
          <Link
            className="reading-kept"
            to={`/articles/${encodeURIComponent(item.savedArticleId)}`}
          >
            ✓ In your Library
          </Link>
        ) : (
          <button
            className="reading-keep"
            disabled={Boolean(busy)}
            onClick={() => onAct(item.itemId, 'keep')}
          >
            {busy === `${item.itemId}:keep` ? 'Keeping…' : 'Keep in Library'}
          </button>
        )}
        {item.readerStatus === 'later' ? (
          <Link to="/library?scope=later">In Later</Link>
        ) : (
          <button disabled={Boolean(busy)} onClick={() => onAct(item.itemId, 'later')}>
            {busy === `${item.itemId}:later` ? 'Saving…' : 'Later'}
          </button>
        )}
        <button onClick={(event) => onPeek(item, 'thought', event.currentTarget)}>
          Your thought
        </button>
      </div>
      {receipt?.unreadable ? (
        <p className="reading-receipt" role="status">
          Saved the link. Article text wasn’t available.{' '}
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              Open original
            </a>
          ) : null}
        </p>
      ) : null}
      {receipt?.kept ? (
        <button
          className="reading-reason"
          onClick={(event) => onPeek(item, 'thought', event.currentTarget)}
        >
          What made it worth keeping?
        </button>
      ) : null}
      {item.filedBy ? <p className="reading-provenance">Filed by {item.filedBy}</p> : null}
    </article>
  );
}
