import React, { useMemo } from 'react';
import { feedEmptyLine, feedFolios } from '../../pages/feedModel';
import LibraryPiles from './LibraryPiles';
import ScreenWord from './ScreenWord';
import '../../styles/library-column.css';

/*
 * An unrolled scroll for a topic you screened. Newest folio on top: title,
 * source, first graph. Clicking opens the full reader. Piles stay at the foot.
 */

const LibraryFeedColumn = ({
  folder = null,
  articles = [],
  pileArticles = [],
  loading = false,
  error = '',
  onSelectArticle,
  onScreen,
  onPileDone,
  entering = true
}) => {
  const folios = useMemo(() => feedFolios(articles), [articles]);
  const name = folder?.name || 'This shelf';
  const step = (n) => (entering ? `wfp-anim wfp-anim--${n}` : 'library-column__return');

  return (
    <main className="library-feed" aria-labelledby="library-feed-title">
      <header className={`library-feed__masthead ${step(1)}`}>
        <p className="library-column__eyebrow">{name}</p>
        <h1 className="sr-only" id="library-feed-title">{name}</h1>
        <ScreenWord asFeed={Boolean(folder?.asFeed)} onScreen={onScreen} />
      </header>

      {error ? <p className="library-column__error" role="alert">{error}</p> : null}

      {loading && !folios.length ? (
        <p className="library-column__quiet" role="status">Opening the scroll…</p>
      ) : null}

      {folios.length ? (
        <div className={`library-feed__folios ${step(2)}`}>
          {folios.map((folio) => (
            <article key={folio.id} className="library-feed__folio">
              <h2>
                <button
                  type="button"
                  className="library-feed__title"
                  onClick={() => onSelectArticle?.(folio.id)}
                >
                  {folio.title}
                </button>
              </h2>
              {folio.source ? <p className="library-feed__source">{folio.source}</p> : null}
              {folio.graph ? <p className="library-feed__graph">{folio.graph}</p> : null}
            </article>
          ))}
        </div>
      ) : null}

      {!loading && !folios.length ? (
        <p className={`library-column__quiet ${step(2)}`}>{feedEmptyLine(name)}</p>
      ) : null}

      <LibraryPiles
        articles={pileArticles}
        onSelect={onSelectArticle}
        onDone={onPileDone}
      />
    </main>
  );
};

export default LibraryFeedColumn;
