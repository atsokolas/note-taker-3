import React from 'react';
import { Link } from 'react-router-dom';
import { publicSourceHref, sourceNote, sureLine } from '../../pages/editionModel';
import { findingAnchor } from './editionReadingState';
import AgentMark from './AgentMark';
import EditionReadings from './EditionReadings';
import { Figures, Held, Passage } from './EditionLayer';

export const EditionBoundary = ({ children }) => (
  <aside className="reading-boundary">
    <span>What it doesn’t show</span>
    <p>{children}</p>
  </aside>
);

const HANDS = ['', 'one', 'two', 'three', 'four'];

/**
 * One finding, led by what it means for you: the plain line is the heading,
 * the numbers carry it, the agent's finding and its limit follow, and the
 * margin says where it comes from and how sure to be. The choices are the
 * reader's: keep it, read the source, save it for later, or set it aside.
 */
export default function EditionFinding({ editionId, item, number, section = '', zoomed, busy, receipt, onAct, onPeek, onSelection }) {
  const href = publicSourceHref(item.url);
  const heading = item.plain || item.title;
  if (item.readerStatus === 'dismissed') {
    return (
      <article className="edition-finding is-set-aside" id={findingAnchor(item.itemId)} data-reading-item={item.itemId} tabIndex={-1}>
        <p>
          Set aside: {heading}{' '}
          <button type="button" disabled={Boolean(busy)} onClick={() => onAct(item.itemId, 'new')}>Undo</button>
        </p>
      </article>
    );
  }
  /* The first reading is the passage a thought can quote from. */
  const prose = (text, first = true) => (
    <div
      className="reading-prose"
      {...(first ? { 'data-finding-text': item.itemId, onMouseUp: onSelection, onKeyUp: onSelection } : {})}
    >
      <p>{text}</p>
    </div>
  );
  const readings = Boolean(item.readings?.length);
  const note = sourceNote(item);
  const sure = sureLine(item);
  return (
    <article
      className={`edition-finding${zoomed ? ' is-zoomed' : ''}`}
      id={findingAnchor(item.itemId)}
      data-reading-item={item.itemId}
      tabIndex={-1}
    >
      <div className="edition-finding__main">
        {number ? (
          <p className="edition-finding__kicker">
            <span className="edition-finding__number">{String(number).padStart(2, '0')}</span>
            {section ? ` · ${section}` : ''}
          </p>
        ) : null}
        <h2>{heading}</h2>
        <Figures figures={item.figures} />
        {readings ? (
          <EditionReadings item={item} finding={prose} Boundary={EditionBoundary} />
        ) : (
          <>
            {prose(item.finding)}
            <EditionBoundary>{item.boundary}</EditionBoundary>
            {item.note ? <p className="reading-editorial-note">{item.note}</p> : null}
          </>
        )}
        <Passage item={item} />
        <div className="reading-actions">
          {item.savedArticleId ? (
            <Link className="reading-kept" to={`/articles/${encodeURIComponent(item.savedArticleId)}`}>
              ✓ Kept in your Library
            </Link>
          ) : (
            <button className="reading-keep" disabled={Boolean(busy)} onClick={() => onAct(item.itemId, 'keep')}>
              {busy === `${item.itemId}:keep` ? 'Keeping…' : 'Keep'}
            </button>
          )}
          <button className="reading-open" onClick={(event) => onPeek(item, 'source', event.currentTarget)}>
            Read the source
          </button>
          {item.readerStatus === 'later' ? (
            <Link to="/library?scope=later">In Later</Link>
          ) : (
            <button disabled={Boolean(busy)} onClick={() => onAct(item.itemId, 'later')}>
              {busy === `${item.itemId}:later` ? 'Saving…' : 'Later'}
            </button>
          )}
          {item.savedArticleId ? null : (
            <button disabled={Boolean(busy)} onClick={() => onAct(item.itemId, 'dismissed')}>Not for me</button>
          )}
          <button onClick={(event) => onPeek(item, 'thought', event.currentTarget)}>Your thought</button>
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
          <button className="reading-reason" onClick={(event) => onPeek(item, 'thought', event.currentTarget)}>
            What made it worth keeping?
          </button>
        ) : null}
      </div>
      <aside className="edition-finding__margin" aria-label="About this finding">
        {item.plain || note ? (
          <div>
            <h3>Source</h3>
            {item.plain ? <p>{item.title}</p> : null}
            {note ? <p className="edition-finding__quiet">{note}</p> : null}
          </div>
        ) : null}
        {sure ? (
          <div>
            <h3>How sure to be</h3>
            <p>{sure}</p>
          </div>
        ) : null}
        {zoomed ? <Held editionId={editionId} itemId={item.itemId} /> : null}
        {readings ? (
          <p className="edition-finding__quiet">Read on their own by {HANDS[item.readings.length + 1] || item.readings.length + 1} hands</p>
        ) : item.filedBy ? (
          <p className="edition-finding__quiet">
            Picked by <AgentMark runtime={item.filedByRuntime} label={item.filedBy} />
          </p>
        ) : null}
      </aside>
    </article>
  );
}
