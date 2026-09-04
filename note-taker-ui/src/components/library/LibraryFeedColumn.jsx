import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { feedEmptyLine, feedFolios } from '../../pages/feedModel';
import { placementOf } from '../../pages/placementModel';
import { rowKeyAction } from '../../pages/placementSwitchModel';
import { beginArticleDrag } from '../../pages/dragGrammar';
import { flySentenceInto } from '../../motion/columnMotion';
import LibraryPiles from './LibraryPiles';
import PlacementSwitch from '../PlacementSwitch';
import ScreenWord from './ScreenWord';
import '../../styles/library-column.css';
import { formatSurfaceDate } from '../../utils/dateDisplay';

/*
 * An unrolled scroll for a topic you screened. Newest folio on top: title,
 * source, first graph. Clicking opens the full reader. Piles stay at the foot.
 * The name flies here when the rail is gone; otherwise the rail claims it.
 */

/* One folio, already open. The switch travels here in its compact form —
   revealed on hover and on focus, never announced — because a scroll that
   wore three capsules a screen would read as controls with reading between
   them rather than reading with a way to move. Keys match the piles exactly:
   h home, l later, s set aside. */
const FeedFolio = ({ folio, article = null, onSelectArticle, onPlace }) => {
  const keys = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const action = rowKeyAction(event.key);
    if (!action || action.kind !== 'place' || !onPlace) return;
    event.preventDefault();
    onPlace(folio.id, action.placement);
  };
  return (
    <article
      className="library-feed__folio"
      onKeyDown={keys}
      draggable={Boolean(folio.id)}
      onDragStart={(event) => { beginArticleDrag(event, folio.id); }}
    >
      <h2>
        <button
          type="button"
          className="library-feed__title"
          onClick={() => onSelectArticle?.(folio.id)}
        >
          {folio.title}
        </button>
      </h2>
      {onPlace ? (
        <div className="library-feed__folio-switch">
          <PlacementSwitch
            articleId={folio.id}
            placement={placementOf(article || {})}
            folderName={article?.folder?.name}
            asFeed={Boolean(article?.folder?.asFeed)}
            compact
            onChange={(next) => onPlace(folio.id, next)}
          />
        </div>
      ) : null}
      {folio.source ? <p className="library-feed__source">{folio.source}</p> : null}
      {folio.graph ? <p className="library-feed__graph">{folio.graph}</p> : null}
    </article>
  );
};

const LibraryFeedColumn = ({
  folder = null,
  articles = [],
  pileArticles = [],
  ledger = [],
  loading = false,
  error = '',
  onSelectArticle,
  onScreen,
  onPileDone,
  onPlace
}) => {
  const nameRef = useRef(null);
  const folios = useMemo(() => feedFolios(articles), [articles]);
  /* The scroll shows folios; the switch needs articles. The folio carries
     the id, the article carries the placement — joined here, at the only
     place that holds both. */
  const articleById = useMemo(() => new Map(
    (Array.isArray(articles) ? articles : [])
      .map((article) => [String(article?._id || article?.id || ''), article])
      .filter(([id]) => id)
  ), [articles]);
  const name = folder?.name || 'This shelf';

  useLayoutEffect(() => {
    flySentenceInto(nameRef.current, name);
  }, [name]);

  return (
    <main className="library-feed noeis-meander" aria-labelledby="library-feed-title">
      <header className="library-feed__masthead">
        <p ref={nameRef} className="library-column__eyebrow">{name}</p>
        <h1 className="sr-only" id="library-feed-title">{name}</h1>
        <ScreenWord asFeed={Boolean(folder?.asFeed)} sentence={name} onScreen={onScreen} />
        {/* Screening leaves a receipt: the day you decided this folder reads
            as a scroll. Absent until there is a date, because a folder that
            was screened before the product started recording it has no
            honest day to show. */}
        {folder?.asFeedAt ? (
          <p className="library-feed__screened">{`screened ${formatSurfaceDate(folder.asFeedAt)}`}</p>
        ) : null}
      </header>

      {error ? <p className="library-column__error" role="alert">{error}</p> : null}

      {loading && !folios.length ? (
        <p className="library-column__quiet" role="status">Opening the scroll…</p>
      ) : null}

      {folios.length ? (
        <div className="library-feed__folios">
          {folios.map((folio) => (
            <FeedFolio
              key={folio.id}
              folio={folio}
              article={articleById.get(folio.id) || null}
              onSelectArticle={onSelectArticle}
              onPlace={onPlace}
            />
          ))}
        </div>
      ) : null}

      {!loading && !folios.length ? (
        <p className="library-column__quiet">{feedEmptyLine(name)}</p>
      ) : null}

      <LibraryPiles
        articles={pileArticles}
        ledger={ledger}
        onSelect={onSelectArticle}
        onDone={onPileDone}
        onPlace={onPlace}
      />
    </main>
  );
};

export default LibraryFeedColumn;
