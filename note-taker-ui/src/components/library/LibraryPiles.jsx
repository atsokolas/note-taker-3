import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  laterPileLine,
  orderLaterOldestFirst,
  orderSetAsideNewestFirst,
  placementOf,
  setAsidePileLine
} from '../../pages/placementModel';
import { flySentenceInto, peekSentenceHandoff } from '../../motion/columnMotion';
import { normalizeSpaces } from '../../utils/editorialText';
import { beginArticleDrag, carriesArticleDrag, DROP_KINDS, dropIntent, readArticleDragId } from '../../pages/dragGrammar';
import '../../styles/library-column.css';
import PlacementSwitch from '../PlacementSwitch';
import { rowKeyAction } from '../../pages/placementSwitchModel';

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

/* A pile under a dragged piece. Reads the grammar straight off the gesture —
   no lifted state, no knowledge of where the row lives — and only when the
   pile can actually park, so a display-only pile never invites a drop. */
const useArticleDrop = ({ enabled, placement, onPark }) => {
  const [over, setOver] = useState(false);
  return {
    over,
    /* The eyebrow already inks for eyes; this speaks the same intent once
       for ears. */
    intent: over
      ? dropIntent({ kind: DROP_KINDS.PILE, targetId: placement, placement })
      : '',
    handleDragOver: (event) => {
      if (!enabled || !carriesArticleDrag(event)) return;
      event.preventDefault();
      if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
      setOver(true);
    },
    handleDragLeave: (event) => {
      const related = event?.relatedTarget;
      if (related && event.currentTarget?.contains?.(related)) return;
      setOver(false);
    },
    handleDrop: (event) => {
      const id = enabled ? readArticleDragId(event) : '';
      setOver(false);
      if (!id) return;
      event.preventDefault();
      onPark?.(id);
    }
  };
};

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
    // listRef arrives as an argument rather than from useRef here, so the hook
    // rules cannot know it is stable. Naming it is both true and free.
  }, [articles, listRef]);
};

/* One switch travels. On a row it is compact and wears no vow — Keep belongs
   where you are reading a thing, not where you are sorting a pile — and single
   letters work on a focused row: h home, l later, s set aside. */
const PileRow = ({ article, onSelect, onDone, onPlace, hinting = false }) => {
  const id = idOf(article);
  const keys = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const action = rowKeyAction(event.key);
    if (!action || action.kind !== 'place' || !onPlace) return;
    event.preventDefault();
    onPlace(id, action.placement);
  };

  return (
    <li
      onKeyDown={keys}
      /* A parked piece travels too: onto the other pile re-parks it, onto a
         folder files it home. */
      draggable={Boolean(id)}
      onDragStart={(event) => { beginArticleDrag(event, id); }}
    >
      <button type="button" className="library-pile__title" onClick={() => onSelect?.(id)}>
        {titleOf(article)}
      </button>
      {/* Hints only while holding ?. A row that always showed its keys would
          be teaching every reader something most of them never asked for; a
          row that never showed them would be a secret. */}
      {hinting ? <span className="library-pile__keys" aria-hidden="true">h l s k</span> : null}
      {onPlace ? (
        <PlacementSwitch
          articleId={id}
          placement={placementOf(article)}
          compact
          onChange={(next) => onPlace(id, next)}
        />
      ) : null}
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

const LaterPile = ({ articles, ledger = [], onSelect, onDone, onPlace, hinting }) => {
  const listRef = useRef(null);
  const line = laterPileLine(articles);
  usePileLanding(articles, listRef);
  const drop = useArticleDrop({
    enabled: Boolean(onPlace),
    placement: 'later',
    onPark: (id) => onPlace?.(id, 'later')
  });
  if (!articles.length) return null;
  return (
    <section
      className={`library-pile library-pile--later${drop.over ? ' is-drop-target' : ''}`}
      aria-label="Later"
      onDragOver={drop.handleDragOver}
      onDragLeave={drop.handleDragLeave}
      onDrop={drop.handleDrop}
    >
      {drop.intent ? <span role="status" className="sr-only">{drop.intent}</span> : null}
      <p className="library-pile__eyebrow">Later</p>
      {line ? <p className="library-pile__line">{line}</p> : null}
      <ul ref={listRef} className="library-pile__list">
        {articles.map((article) => (
          <PileRow onPlace={onPlace} hinting={hinting} key={idOf(article)} article={article} onSelect={onSelect} onDone={onDone} />
        ))}
      </ul>
      {/* The promise ledger: pending mornings printed where the parked pieces
         are, so an appointment is findable without going looking for a route
         nobody advertises. Silence when there is nothing appointed. */}
      {ledger.length ? (
        <ul className="library-pile__ledger" aria-label="Promised returns">
          {ledger.map((row) => (
            <li key={row.key}>
              <span>asked back — </span>
              <button
                type="button"
                className="library-pile__ledger-title"
                onClick={() => onSelect?.(row.articleId)}
              >
                {row.title}
              </button>
              {row.day ? <span> · {row.day}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

const SetAsidePile = ({ articles, onSelect, onDone, onPlace, hinting }) => {
  const listRef = useRef(null);
  const [open, setOpen] = useState(() => awaitingSentence(articles));
  const line = setAsidePileLine(articles);
  usePileLanding(articles, listRef);
  const drop = useArticleDrop({
    enabled: Boolean(onPlace),
    placement: 'setAside',
    onPark: (id) => onPlace?.(id, 'setAside')
  });

  useEffect(() => {
    if (awaitingSentence(articles)) setOpen(true);
  }, [articles]);

  if (!articles.length) return null;
  /* The stack counts materially: one drawn folio edge per piece, up to five.
     Beyond five the edges stop being countable at a glance and start being
     texture, so the fifth is followed by 5+ rather than a sixth edge nobody
     could read. A pile that looks the same at six as at sixty is a pile
     lying about its weight. */
  const leaves = Math.min(5, articles.length);
  const overflowed = articles.length > 5;
  return (
    <section
      className={`library-pile library-pile--setAside noeis-meander${open ? ' is-open' : ''}${drop.over ? ' is-drop-target' : ''}`}
      aria-label="Set aside"
      onDragOver={drop.handleDragOver}
      onDragLeave={drop.handleDragLeave}
      onDrop={drop.handleDrop}
    >
      {drop.intent ? <span role="status" className="sr-only">{drop.intent}</span> : null}
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
                <PileRow onPlace={onPlace} hinting={hinting} key={idOf(article)} article={article} onSelect={onSelect} onDone={onDone} />
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
            {overflowed ? <span className="library-pile__more">5+</span> : null}
          </span>
          <span>Open the stack</span>
        </button>
      )}
    </section>
  );
};

const LibraryPiles = ({ articles = [], ledger = [], onSelect, onDone, onPlace }) => {
  /* Holding ? shows what the letters do. Released, they go away again —
     the keys are for the reader who already wants them, and the hint is for
     the one who suspects they exist. */
  const [hinting, setHinting] = useState(false);
  useEffect(() => {
    const down = (event) => { if (event.key === '?') setHinting(true); };
    const up = (event) => { if (event.key === '?') setHinting(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const later = orderLaterOldestFirst(articles);
  const aside = orderSetAsideNewestFirst(articles);
  if (!later.length && !aside.length) return null;
  return (
    <div className="library-piles" data-testid="library-piles">
      <LaterPile onPlace={onPlace} hinting={hinting} articles={later} ledger={ledger} onSelect={onSelect} onDone={onDone} />
      <SetAsidePile onPlace={onPlace} hinting={hinting} articles={aside} onSelect={onSelect} onDone={onDone} />
    </div>
  );
};

export default LibraryPiles;
