import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatSurfaceDate } from '../../utils/dateDisplay';
import { buildLibraryColumn } from './libraryColumnModel';
import {
  buildEvergreenIndex,
  evergreenHref,
  keptShelfLine,
  orderKeptOldestFirst,
  EVERGREEN_KIND_LABEL
} from '../../pages/evergreenModel';
import {
  laterPileLine,
  orderLaterOldestFirst,
  orderSetAsideNewestFirst,
  setAsidePileLine
} from '../../pages/placementModel';
import '../../styles/library-column.css';

// The face of the Library: one thing to continue, then the shelf.
//
// No cabinet, no counts, no "Your Library" over a filing system. Finding is one
// field and saving is one link, both in the column where the reading is — a
// person looking for something types; they do not open a drawer first.

const CHROME_STORE_LINK = 'https://chromewebstore.google.com/detail/noeis/kjhhcmgbhbeoglbhcjcpcjljcaimalkg';

const DEDICATED = {
  kept: {
    eyebrow: 'Kept',
    empty: 'Nothing kept yet. Open a source and press Keep for good when it is worth returning to for years rather than days.',
    fallback: 'Held for life, and never counted as neglected.',
    line: keptShelfLine,
    order: orderKeptOldestFirst,
    dateOf: (entry) => entry.keptAt || null,
    canon: true
  },
  later: {
    eyebrow: 'Later',
    empty: 'Nothing owed a move. Open a source and press Later when it still wants a move, just not now.',
    fallback: 'Owed a move, oldest first.',
    line: laterPileLine,
    order: orderLaterOldestFirst,
    dateOf: (article) => article.placementAt || article.createdAt || null
  },
  'set-aside': {
    eyebrow: 'Set aside',
    empty: 'Nothing at hand. Open a source and press Set aside when you want it close this week.',
    fallback: 'At hand this week, newest on top.',
    line: setAsidePileLine,
    order: orderSetAsideNewestFirst,
    dateOf: (article) => article.placementAt || article.createdAt || null
  }
};

const LibraryColumn = ({
  shelf = 'all',
  articles = [],
  allArticles = [],
  loading = false,
  error = '',
  query = '',
  onQueryChange,
  onSelectArticle,
  /* Kept pages and beliefs, or null until the shelf has actually been read.
     Null is not an empty shelf: rendering "nothing kept" before the answer
     arrives tells the reader their canon is empty when we simply had not
     looked. */
  keptPages = null,
  entering = true
}) => {
  const { continueItem, rows } = useMemo(
    () => buildLibraryColumn({ articles, allArticles }),
    [allArticles, articles]
  );
  /* Dedicated shelves are lists you came looking for, so they do not lead
     with something to continue. Later is oldest owed; Set aside is newest
     at hand; Kept is the canon, oldest decision first. */
  const dedicated = DEDICATED[shelf] || null;
  /* The canon is the one shelf that is not a list of articles. A source you
     read, a page you built and a belief you hold stand on it as peers, so it
     reads the cross-kind index rather than the article query. */
  const canonRead = !dedicated?.canon || Array.isArray(keptPages);
  const shelfItems = useMemo(() => (dedicated?.canon
    ? buildEvergreenIndex({ articles, pages: keptPages || [] })
    : articles), [articles, dedicated, keptPages]);
  const dedicatedRows = useMemo(() => (dedicated
    ? dedicated.order(shelfItems).map(item => ({
      id: String(item.targetId || item._id || item.id || ''),
      title: item.title || 'Untitled source',
      source: item.detail ?? (item.siteName || item.author || ''),
      date: dedicated.dateOf(item),
      kind: item.kind || '',
      href: item.kind ? evergreenHref(item) : '',
      retiredAt: item.retiredAt || null
    }))
    : []), [dedicated, shelfItems]);
  const dedicatedLine = useMemo(
    () => (dedicated && canonRead ? dedicated.line(shelfItems) : ''),
    [canonRead, dedicated, shelfItems]
  );
  const shelfRows = dedicated ? dedicatedRows : rows;
  const step = (n) => (entering ? `wfp-anim wfp-anim--${n}` : 'library-column__return');

  return (
    <main className="library-column" aria-labelledby="library-column-title">
      <h1 className="sr-only" id="library-column-title">Library</h1>
      <p className={`library-column__eyebrow ${step(1)}`}>{dedicated?.eyebrow || 'Library'}</p>
      {dedicated && canonRead ? (
        <p className={`library-column__shelf-note ${step(1)}`}>
          {dedicatedLine || dedicated.fallback}
        </p>
      ) : null}

      {continueItem && !dedicated ? (
        <section className={`library-column__continue ${step(2)}`} aria-labelledby="library-continue-title">
          <p className="library-column__kicker">Continue</p>
          <h2 id="library-continue-title">
            <button type="button" onClick={() => onSelectArticle?.(continueItem.id)}>
              {continueItem.title}
            </button>
          </h2>
          {continueItem.source ? <p className="library-column__source">{continueItem.source}</p> : null}
          {/* Where you left off, when we know. A reading position nobody wrote
              down is one we do not have, and the line is simply absent. */}
          {continueItem.place ? <p className="library-column__place">{continueItem.place}</p> : null}
          {continueItem.dek ? <p className="library-column__dek">{continueItem.dek}</p> : null}
          <button
            type="button"
            className="library-column__continue-link"
            onClick={() => onSelectArticle?.(continueItem.id)}
          >
            Continue →
          </button>
        </section>
      ) : null}

      {/* Finding and saving live in the column. They are two lines of the page,
          not a cabinet you have to open first. */}
      <div className={`library-column__tools ${step(3)}`}>
        <label className="library-column__find">
          <span>Find in library</span>
          <input
            type="search"
            aria-label="Search articles"
            value={query}
            placeholder="Search…"
            onChange={(event) => onQueryChange?.(event.target.value)}
          />
        </label>
        <a className="library-column__saver" href={CHROME_STORE_LINK} target="_blank" rel="noreferrer">
          Install the saver
        </a>
      </div>

      {error ? <p className="library-column__error" role="alert">{error}</p> : null}

      {loading && !shelfRows.length ? (
        <p className="library-column__quiet" role="status">Opening the shelf…</p>
      ) : null}

      {shelfRows.length ? (
        <ul className={`library-column__shelf ${step(4)}`}>
          {shelfRows.map(item => (
            <li key={item.id} className={item.retiredAt ? 'is-retired' : undefined}>
              {item.href ? (
                <Link to={item.href}>
                  {item.kind ? (
                    <span className="library-column__row-kind">{EVERGREEN_KIND_LABEL[item.kind]}</span>
                  ) : null}
                  <span className="library-column__row-title">{item.title}</span>
                  {item.source ? <span className="library-column__row-source">{item.source}</span> : null}
                  <span className="library-column__row-date">
                    {formatSurfaceDate(item.date, { includeYear: true })}
                  </span>
                  {/* Errata, not a warning: it says when the belief went, and
                      keeps it where it has always stood. */}
                  {item.retiredAt ? (
                    <span className="library-column__row-retired">
                      {`retired ${formatSurfaceDate(item.retiredAt)}`}
                    </span>
                  ) : null}
                </Link>
              ) : (
                <button type="button" onClick={() => onSelectArticle?.(item.id)}>
                  <span className="library-column__row-title">{item.title}</span>
                  <span className="library-column__row-source">{item.source}</span>
                  <span className="library-column__row-date">
                    {formatSurfaceDate(item.date, { includeYear: true })}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {/* The canon signs itself, and only when it holds something. Memory and
          judgment — the two things the shelf is made of. */}
      {dedicated?.canon && shelfRows.length ? (
        <p className="library-column__colophon" aria-hidden="true">μνήμη · κρίσις</p>
      ) : null}

      {/* Nothing saved yet is a sentence, not a dashboard of zeroes. */}
      {!loading && canonRead && !shelfRows.length && !continueItem ? (
        <p className={`library-column__quiet ${step(4)}`}>
          {query
            ? `Nothing in your library matches “${query}”.`
            : dedicated
              ? dedicated.empty
              : <>Nothing saved yet. <Link to="/connections#sources">Connect a source</Link> or install the saver and read something.</>}
        </p>
      ) : null}
    </main>
  );
};

export default LibraryColumn;
