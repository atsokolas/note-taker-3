import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  laterPileLine,
  orderLaterOldestFirst,
  orderSetAsideNewestFirst,
  setAsidePileLine
} from '../../pages/placementModel';
import { flySentenceInto, peekSentenceHandoff } from '../../motion/columnMotion';
import { normalizeSpaces } from '../../utils/editorialText';
import '../../styles/library-column.css';

/*
 * Hey keeps both piles at the foot of the Imbox. We steal that.
 *
 * Later is work: oldest owed on top. Set aside is a folio stack you fan.
 * Empty means absent — never a zero, never a skeleton. A parked title flies
 * here from the reader; the fan opens so it has somewhere to land.
 */

const WARM_MS = 420;
const titleOf = (article) => article.title || 'Untitled source';
const idOf = (article) => String(article?._id || article?.id || '').trim();

const awaitingSentence = (articles) => {
  const pending = peekSentenceHandoff()?.sentence;
  if (!pending) return false;
  return articles.some((article) => normalizeSpaces(titleOf(article)) === pending);
};

const usePileLanding = (articles, listRef) => {
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return undefined;
    const buttons = [...root.querySelectorAll('.library-pile__title')];
    let pile = null;
    articles.some((article, index) => {
      const node = buttons[index];
      if (!node || !flySentenceInto(node, titleOf(article))) return false;
      pile = node.closest('.library-pile');
      pile?.classList.add('is-warm');
      return true;
    });
    if (!pile) return undefined;
    const timer = window.setTimeout(() => pile.classList.remove('is-warm'), WARM_MS);
    return () => window.clearTimeout(timer);
  }, [articles]);
};

const PileRow = ({ article, onSelect, onDone }) => {
  const id = idOf(article);
  return (
    <li>
      <button type="button" className="library-pile__title" onClick={() => onSelect?.(id)}>
        {titleOf(article)}
      </button>
      {onDone ? (
        <button
          type="button"
          className="library-pile__done"
          onClick={() => onDone(id)}
        >
          Done
        </button>
      ) : null}
    </li>
  );
};

const LaterPile = ({ articles, onSelect, onDone }) => {
  const listRef = useRef(null);
  const line = laterPileLine(articles);
  usePileLanding(articles, listRef);
  if (!articles.length) return null;
  return (
    <section className="library-pile library-pile--later" aria-label="Later">
      <p className="library-pile__eyebrow">Later</p>
      {line ? <p className="library-pile__line">{line}</p> : null}
      <ul ref={listRef} className="library-pile__list">
        {articles.map((article) => (
          <PileRow key={idOf(article)} article={article} onSelect={onSelect} onDone={onDone} />
        ))}
      </ul>
    </section>
  );
};

const SetAsidePile = ({ articles, onSelect, onDone }) => {
  const listRef = useRef(null);
  const [open, setOpen] = useState(() => awaitingSentence(articles));
  const line = setAsidePileLine(articles);
  usePileLanding(articles, listRef);

  useEffect(() => {
    if (awaitingSentence(articles)) setOpen(true);
  }, [articles]);

  if (!articles.length) return null;
  const leaves = Math.min(3, articles.length);
  return (
    <section
      className={`library-pile library-pile--setAside noeis-meander${open ? ' is-open' : ''}`}
      aria-label="Set aside"
    >
      <p className="library-pile__eyebrow">Set aside</p>
      {line ? <p className="library-pile__line">{line}</p> : null}
      {open ? (
        <>
          <button
            type="button"
            className="library-pile__sheet-scrim"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="library-pile__sheet">
            <button
              type="button"
              className="library-pile__sheet-dismiss"
              onClick={() => setOpen(false)}
            >
              Close the stack
            </button>
            <ul ref={listRef} className="library-pile__list">
              {articles.map((article) => (
                <PileRow key={idOf(article)} article={article} onSelect={onSelect} onDone={onDone} />
              ))}
            </ul>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="library-pile__stack"
          aria-expanded="false"
          onClick={() => setOpen(true)}
        >
          <span className="library-pile__fan" aria-hidden="true">
            {Array.from({ length: leaves }, (_, index) => (
              <span key={index} className="library-pile__leaf" />
            ))}
          </span>
          <span>Open the stack</span>
        </button>
      )}
    </section>
  );
};

const LibraryPiles = ({ articles = [], onSelect, onDone }) => {
  const later = orderLaterOldestFirst(articles);
  const aside = orderSetAsideNewestFirst(articles);
  if (!later.length && !aside.length) return null;
  return (
    <div className="library-piles" data-testid="library-piles">
      <LaterPile articles={later} onSelect={onSelect} onDone={onDone} />
      <SetAsidePile articles={aside} onSelect={onSelect} onDone={onDone} />
    </div>
  );
};

export default LibraryPiles;
