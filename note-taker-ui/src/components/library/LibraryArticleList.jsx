import React, { Profiler, useEffect, useMemo, useRef, useState } from 'react';
import { SectionHeader } from '../ui';
import VirtualList from '../virtual/VirtualList';
import { createProfilerLogger } from '../../utils/perf';
import {
  getArticleTags,
  getConnectedConceptNames,
  getHighlightCount,
  getWhyItMatters
} from './libraryReadingRoomModel';
import LibraryEmptyState from './LibraryEmptyState';
import { filterLibraryBrowseItems } from '../../utils/cruftSuppression';
import { formatSurfaceDate } from '../../utils/dateDisplay';
import useMagneticRow from '../../hooks/useMagneticRow';
import { humanizeLabel } from '../../utils/humanizeLabel';
import { normalizeSpaces } from '../../utils/editorialText';
import { beginArticleDrag } from '../../pages/dragGrammar';

const getSourceLabel = (article) => {
  const explicit = article?.source || article?.publication || article?.publisher || article?.siteName;
  if (explicit) return String(explicit);
  const url = String(article?.url || '').trim();
  if (!url) return 'Saved article';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return humanizeLabel(host.split('.').filter(Boolean).slice(0, -1).join(' ')) || host;
  } catch (error) {
    return 'Saved article';
  }
};

const trimExcerpt = (text) => {
  const normalized = normalizeSpaces(text);
  if (!normalized) return '';
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177)}...`;
};

const getHighlightExcerpt = (article) => {
  const highlights = Array.isArray(article?.highlights) ? article.highlights : [];
  const first = highlights.find((item) => String(item?.text || item?.quote || item?.content || '').trim());
  if (!first) return '';
  return trimExcerpt(first.text || first.quote || first.content || '');
};

/**
 * Enough of a piece to judge it by.
 *
 * A line the reader marked themselves comes first, because they already told
 * us what mattered in the piece. Failing that, its opening sentence.
 *
 * This read five fields for a stored summary and nothing else, and an article
 * carries none of them — not on the schema, not in the projection. So for
 * every source without a highlight it returned nothing at all, silently, which
 * is why the Library's rows had no previews and the Continue card had no
 * standfirst. The opening has been travelling the whole time, on a field named
 * `firstGraph`: the server cuts it at a sentence boundary and drops the body,
 * so the reading itself never leaves. Nobody was reading it.
 *
 * It only arrives when the caller asked for a preview, so a surface that does
 * not show one does not pay for one.
 */
export const getExcerpt = (article) => {
  const raw = article?.summary || article?.description || article?.excerpt || article?.previewText || article?.snippet || '';
  const fromFields = trimExcerpt(raw);
  if (fromFields) return fromFields;

  const fromHighlight = getHighlightExcerpt(article);
  if (fromHighlight) return fromHighlight;

  return trimExcerpt(article?.firstGraph || '');
};

/**
 * @param {{
 *  articles: Array<{ _id: string, title: string, url?: string, createdAt?: string, highlights?: Array }>,
 *  loading: boolean,
 *  error: string,
 *  emptyLabel: string,
 *  onSelectArticle: (id: string) => void,
 *  onMoveArticle?: (article: { _id: string }) => void
 * }} props
 */
const ARTICLE_ROW_HEIGHT = 164;
const SKELETON_ROWS = 6;

const ArticleRowSkeleton = React.memo(() => (
  <div className="library-article-row" aria-hidden="true">
    <div style={{ flex: 1 }}>
      <div className="skeleton skeleton-title" style={{ width: '58%', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="skeleton skeleton-text" style={{ width: 72 }} />
        <div className="skeleton skeleton-text" style={{ width: 110 }} />
      </div>
    </div>
  </div>
));

const LibraryArticleRow = React.memo(({
  article,
  onSelectArticle,
  onMoveArticle
}) => {
  const [activated, setActivated] = useState(false);
  const receiptTimerRef = useRef(null);
  const magnetic = useMagneticRow();
  const sourceLabel = getSourceLabel(article);
  const tags = getArticleTags(article);
  const conceptNames = getConnectedConceptNames(article);
  const excerpt = getExcerpt(article);
  const whyItMatters = getWhyItMatters(article, excerpt);
  const highlightCount = getHighlightCount(article);
  const rowDate = article.updatedAt || article.createdAt;

  const triggerReceipt = () => {
    setActivated(true);
    if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
    receiptTimerRef.current = window.setTimeout(() => setActivated(false), 720);
  };

  useEffect(() => () => {
    if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
  }, []);

  return (
  <div
    ref={magnetic.rowRef}
    className={`library-article-row is-magnetic${activated ? ' is-activated' : ''}`}
    onPointerMove={magnetic.onPointerMove}
    onPointerLeave={magnetic.onPointerLeave}
    /* Onto a folder files it; onto a pile parks it. The row names itself on
       the gesture and the landing surface reads the grammar — neither knows
       the other. */
    draggable
    onDragStart={(event) => { beginArticleDrag(event, article?._id); }}
  >
    <div className="library-article-row-date">{formatSurfaceDate(rowDate, { includeYear: true })}</div>
    <button
      className="library-article-row-main"
      type="button"
      aria-label={`Open in Reading Room: ${article.title || 'Untitled article'}`}
      data-testid="library-article-open"
      onClick={() => {
        triggerReceipt();
        onSelectArticle(article._id);
      }}
    >
      <div className="library-article-row-title">{article.title || 'Untitled article'}</div>
      <div className="library-article-row-kicker">
        <span className="library-article-row-source">{sourceLabel}</span>
        {tags.map((tag) => (
          <span key={`${article._id}-${tag}`} className="library-article-row-tag">#{tag}</span>
        ))}
      </div>
      {whyItMatters ? (
        <div className="library-article-row-excerpt">{whyItMatters}</div>
      ) : null}
      {highlightCount > 0 || conceptNames.length > 0 ? (
        <div className="library-article-row-meta">
          {highlightCount > 0 ? (
            <span>{highlightCount} highlight{highlightCount === 1 ? '' : 's'}</span>
          ) : null}
          {conceptNames.length > 0 ? (
            <span className="library-article-row-concepts">
              Connected: {conceptNames.slice(0, 3).join(', ')}
            </span>
          ) : null}
        </div>
      ) : null}
    </button>
    {onMoveArticle && (
      <button
        className="library-article-row-action"
        onClick={(e) => {
          e.stopPropagation();
          triggerReceipt();
          onMoveArticle(article);
        }}
      >
        Move
      </button>
    )}
    {activated ? <span className="library-article-row-receipt" role="status">Opening</span> : null}
  </div>
  );
});

const LibraryArticleList = ({
  articles,
  loading,
  error,
  emptyLabel,
  onSelectArticle,
  onMoveArticle,
  scope = 'all',
  query = '',
  onQueryChange = null,
  suppressedVisible = false,
  corpusTotal,
  rawCorpusTotal,
  suppressedCount = 0,
  latestReceipt = null
}) => {
  const hasError = Boolean(error);
  const visibleArticles = useMemo(() => {
    const list = Array.isArray(articles) ? articles : [];
    const trimmedQuery = String(query || '').trim();
    if (suppressedVisible) return list;
    if (trimmedQuery || (scope !== 'all' && scope !== 'unfiled')) return list;
    return filterLibraryBrowseItems(list);
  }, [articles, query, scope, suppressedVisible]);
  const isEmpty = !loading && !hasError && visibleArticles.length === 0;
  const virtualHeight = useMemo(() => {
    const viewport = typeof window !== 'undefined' ? window.innerHeight : 0;
    return Math.min(680, Math.max(320, viewport ? viewport - 290 : 560));
  }, []);

  return (
    <div
      className={`library-article-list ${loading ? 'is-loading' : ''} ${hasError ? 'has-error' : ''} ${isEmpty ? 'is-empty' : ''}`.trim()}
      data-ui-surface-state={loading ? 'loading' : hasError ? 'error' : isEmpty ? 'empty' : 'ready'}
    >
      <SectionHeader
        title="Articles"
        subtitle="Saved reads and source material."
        className="library-section-head is-articles"
      />
      {onQueryChange ? (
        <label className="library-article-search" htmlFor="library-article-search">
          <span>Search articles</span>
          <input
            id="library-article-search"
            type="search"
            value={query}
            placeholder="Search titles, sources, tags..."
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
      ) : null}
      {loading && (
        <div className="library-article-skeletons">
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <ArticleRowSkeleton key={`article-skeleton-${index}`} />
          ))}
        </div>
      )}
      {error && <p className="status-message error-message">{error}</p>}
      {!loading && !error && visibleArticles.length === 0 && (
        <LibraryEmptyState
          scope={scope}
          corpusTotal={corpusTotal}
          rawCorpusTotal={rawCorpusTotal}
          suppressedCount={suppressedCount}
          suppressedVisible={suppressedVisible}
          query={query}
          emptyLabel={emptyLabel}
          latestReceipt={latestReceipt}
          onClearSearch={onQueryChange ? () => onQueryChange('') : null}
        />
      )}
      {!loading && !error && (
        <Profiler id="LibraryArticleRows" onRender={createProfilerLogger('library.article-list')}>
          {visibleArticles.length > 40 ? (
            <VirtualList
              items={visibleArticles}
              height={virtualHeight}
              itemSize={ARTICLE_ROW_HEIGHT}
              dynamicItemHeights
              className="library-article-list-virtual"
              renderItem={(article, index) => (
                <div key={article._id || index} style={{ paddingBottom: 10 }}>
                  <LibraryArticleRow
                    article={article}
                    onSelectArticle={onSelectArticle}
                    onMoveArticle={onMoveArticle}
                  />
                </div>
              )}
            />
          ) : (
            visibleArticles.map(article => (
              <LibraryArticleRow
                key={article._id}
                article={article}
                onSelectArticle={onSelectArticle}
                onMoveArticle={onMoveArticle}
              />
            ))
          )}
        </Profiler>
      )}
    </div>
  );
};

export default React.memo(LibraryArticleList);
