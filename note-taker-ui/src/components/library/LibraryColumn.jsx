import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatSurfaceDate } from '../../utils/dateDisplay';
import { buildLibraryColumn } from './libraryColumnModel';
import '../../styles/library-column.css';

// The face of the Library: one thing to continue, then the shelf.
//
// No cabinet, no counts, no "Your Library" over a filing system. Finding is one
// field and saving is one link, both in the column where the reading is — a
// person looking for something types; they do not open a drawer first.

const CHROME_STORE_LINK = 'https://chromewebstore.google.com/detail/noeis/kjhhcmgbhbeoglbhcjcpcjljcaimalkg';

const LibraryColumn = ({
  shelf = 'all',
  articles = [],
  allArticles = [],
  loading = false,
  error = '',
  query = '',
  onQueryChange,
  onSelectArticle,
  entering = true
}) => {
  const { continueItem, rows } = useMemo(
    () => buildLibraryColumn({ articles, allArticles }),
    [allArticles, articles]
  );
  /* The kept shelf is the one shelf that is not about what is new, so it does
     not lead with something to continue — it is a list you came looking for. */
  const kept = shelf === 'kept';
  const step = (n) => (entering ? `wfp-anim wfp-anim--${n}` : 'library-column__return');

  return (
    <main className="library-column" aria-labelledby="library-column-title">
      <h1 className="sr-only" id="library-column-title">Library</h1>
      <p className={`library-column__eyebrow ${step(1)}`}>{kept ? 'Kept' : 'Library'}</p>
      {kept ? (
        <p className={`library-column__shelf-note ${step(1)}`}>
          Held for life, and never counted as neglected.
        </p>
      ) : null}

      {continueItem && !kept ? (
        <section className={`library-column__continue ${step(2)}`} aria-labelledby="library-continue-title">
          <p className="library-column__kicker">Continue</p>
          <h2 id="library-continue-title">
            <button type="button" onClick={() => onSelectArticle?.(continueItem.id)}>
              {continueItem.title}
            </button>
          </h2>
          {continueItem.source ? <p className="library-column__source">{continueItem.source}</p> : null}
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

      {loading && !rows.length ? (
        <p className="library-column__quiet" role="status">Opening the shelf…</p>
      ) : null}

      {rows.length ? (
        <ul className={`library-column__shelf ${step(4)}`}>
          {rows.map(item => (
            <li key={item.id}>
              <button type="button" onClick={() => onSelectArticle?.(item.id)}>
                <span className="library-column__row-title">{item.title}</span>
                <span className="library-column__row-source">{item.source}</span>
                <span className="library-column__row-date">
                  {formatSurfaceDate(item.date, { includeYear: true })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Nothing saved yet is a sentence, not a dashboard of zeroes. */}
      {!loading && !rows.length && !continueItem ? (
        <p className={`library-column__quiet ${step(4)}`}>
          {query
            ? `Nothing in your library matches “${query}”.`
            : kept
              ? 'Nothing kept yet. Open a source and press Keep for good when it is worth returning to for years rather than days.'
              : <>Nothing saved yet. <Link to="/connections#sources">Connect a source</Link> or install the saver and read something.</>}
        </p>
      ) : null}
    </main>
  );
};

export default LibraryColumn;
