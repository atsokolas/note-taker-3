import React, { useState } from 'react';
import {
  laterPileLine,
  orderLaterOldestFirst,
  orderSetAsideNewestFirst,
  setAsidePileLine
} from '../../pages/placementModel';
import '../../styles/library-column.css';

/*
 * Hey keeps both piles at the foot of the Imbox. We steal that.
 *
 * Later is work: oldest owed on top. Set aside is a folio stack you fan.
 * Empty means absent — never a zero, never a skeleton.
 */

const idOf = (article) => String(article?._id || article?.id || '').trim();

const PileRow = ({ article, onSelect, onDone }) => {
  const id = idOf(article);
  return (
    <li>
      <button type="button" className="library-pile__title" onClick={() => onSelect?.(id)}>
        {article.title || 'Untitled source'}
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
  const line = laterPileLine(articles);
  if (!articles.length) return null;
  return (
    <section className="library-pile library-pile--later" aria-label="Later">
      <p className="library-pile__eyebrow">Later</p>
      {line ? <p className="library-pile__line">{line}</p> : null}
      <ul className="library-pile__list">
        {articles.map((article) => (
          <PileRow key={idOf(article)} article={article} onSelect={onSelect} onDone={onDone} />
        ))}
      </ul>
    </section>
  );
};

const SetAsidePile = ({ articles, onSelect, onDone }) => {
  const [open, setOpen] = useState(false);
  const line = setAsidePileLine(articles);
  if (!articles.length) return null;
  const leaves = Math.min(3, articles.length);
  return (
    <section className="library-pile library-pile--setAside" aria-label="Set aside">
      <p className="library-pile__eyebrow">Set aside</p>
      {line ? <p className="library-pile__line">{line}</p> : null}
      {open ? (
        <ul className="library-pile__list">
          {articles.map((article) => (
            <PileRow key={idOf(article)} article={article} onSelect={onSelect} onDone={onDone} />
          ))}
        </ul>
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
