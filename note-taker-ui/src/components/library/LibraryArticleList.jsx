import React, { Profiler, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../ui';
import VirtualList from '../virtual/VirtualList';
import { createProfilerLogger } from '../../utils/perf';
import { TOUR_EXTENSION_URL } from '../../tour/tourConfig';
import {
  getArticleTags,
  getConnectedConceptNames,
  getHighlightCount,
  getWhyItMatters
} from './libraryReadingRoomModel';
import {
  formatLibraryCorpusCount,
  formatLibrarySuppressedCount,
  resolveLibraryEmptyState
} from './libraryEmptyStateModel';
import { filterLibraryBrowseItems } from '../../utils/cruftSuppression';
import { formatSurfaceDate } from '../../utils/dateDisplay';

const getSourceLabel = (article) => {
  const explicit = article?.source || article?.publication || article?.publisher || article?.siteName;
  if (explicit) return String(explicit);
  const url = String(article?.url || '').trim();
  if (!url) return 'Saved article';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host
      .split('.')
      .filter(Boolean)
      .slice(0, -1)
      .join(' ')
      .replace(/\b\w/g, (match) => match.toUpperCase()) || host;
  } catch (error) {
    return 'Saved article';
  }
};

const trimExcerpt = (text) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
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

export const getExcerpt = (article) => {
  const raw = article?.summary || article?.description || article?.excerpt || article?.previewText || article?.snippet || '';
  const fromFields = trimExcerpt(raw);
  if (fromFields) return fromFields;

  const fromHighlight = getHighlightExcerpt(article);
  if (fromHighlight) return fromHighlight;

  if (getHighlightCount(article) > 0 || getArticleTags(article).length > 0) {
    return '';
  }

  return '';
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
  const sourceLabel = getSourceLabel(article);
  const tags = getArticleTags(article);
  const conceptNames = getConnectedConceptNames(article);
  const excerpt = getExcerpt(article);
  const whyItMatters = getWhyItMatters(article, excerpt);
  const highlightCount = getHighlightCount(article);
  const rowDate = article.updatedAt || article.createdAt;

  // Cursor-following bloom — same vocabulary as ThinkHome primary action,
  // applied lightly here because rows are dense and many. CSS-only fallback
  // (no JS state) keeps the virtualized list cheap.
  const handlePointerMove = (event) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--row-bloom-x', `${event.clientX - rect.left}px`);
    target.style.setProperty('--row-bloom-y', `${event.clientY - rect.top}px`);
  };
  const handlePointerLeave = (event) => {
    const target = event.currentTarget;
    target.style.removeProperty('--row-bloom-x');
    target.style.removeProperty('--row-bloom-y');
  };
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
    className={`library-article-row is-magnetic${activated ? ' is-activated' : ''}`}
    onPointerMove={handlePointerMove}
    onPointerLeave={handlePointerLeave}
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
      <div className="library-article-row-meta">
        <span>{highlightCount} highlights</span>
        {conceptNames.length > 0 ? (
          <span className="library-article-row-concepts">
            Connected: {conceptNames.slice(0, 3).join(', ')}
          </span>
        ) : null}
      </div>
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

const LibraryEmptyState = ({
  scope,
  corpusTotal,
  rawCorpusTotal,
  suppressedCount,
  suppressedVisible,
  query,
  emptyLabel,
  latestReceipt,
  onClearSearch
}) => {
  const model = resolveLibraryEmptyState({
    scope,
    corpusTotal,
    rawCorpusTotal,
    suppressedCount,
    suppressedVisible,
    query,
    emptyLabel
  });
  if (!model) return null;

  if (model.kind === 'first-run') {
    return (
      <div className="library-empty-state library-empty-state--first-run" data-testid="library-empty-first-run">
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · {model.scopeLabel}</span>
          <h3 className="library-empty-state__title">Save your first source</h3>
          <p className="library-empty-state__body">
            Connect Readwise, import notes, or use the browser extension to save articles.
            Sources you add show up here, ready to read, highlight, and turn into concepts.
          </p>
          {latestReceipt?.summary ? (
            <p className="library-empty-state__receipt muted small" data-testid="library-empty-receipt">
              Last import: {latestReceipt.summary}
            </p>
          ) : null}
        </div>
        <div className="library-empty-state__actions">
          <Link
            className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
            to="/connections#sources"
          >
            Connect a source
          </Link>
          <a
            className="library-empty-state__secondary muted small"
            href={TOUR_EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Install browser extension
          </a>
          <Link className="library-empty-state__secondary muted small" to="/how-to-use">
            See the full walkthrough
          </Link>
        </div>
      </div>
    );
  }

  if (model.kind === 'scoped-empty') {
    const scopeLine = model.scopeLabel === 'All'
      ? 'No sources in this view.'
      : `No sources in ${model.scopeLabel}.`;
    return (
      <div
        className="library-empty-state library-empty-state--scoped"
        data-testid="library-empty-scoped"
        data-scope={scope}
      >
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · {model.scopeLabel}</span>
          <h3 className="library-empty-state__title">{scopeLine}</h3>
          <p className="library-empty-state__body">
            {formatLibraryCorpusCount(model.corpusTotal)}.
            {model.emptyLabel ? ` ${model.emptyLabel}` : ''}
          </p>
        </div>
        <div className="library-empty-state__actions">
          <Link
            className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
            to="/library?scope=all"
            data-testid="library-empty-show-all"
          >
            Show all sources
          </Link>
        </div>
      </div>
    );
  }

  if (model.kind === 'suppressed-empty') {
    return (
      <div
        className="library-empty-state library-empty-state--scoped"
        data-testid="library-empty-suppressed"
        data-scope={scope}
      >
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · {model.scopeLabel}</span>
          <h3 className="library-empty-state__title">No visible sources in this view.</h3>
          <p className="library-empty-state__body">
            {formatLibrarySuppressedCount(model.suppressedCount)}.
            {model.emptyLabel ? ` ${model.emptyLabel}` : ''}
          </p>
        </div>
        <div className="library-empty-state__actions">
          <Link
            className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
            to={`/library?scope=${encodeURIComponent(scope || 'all')}&showSuppressed=1`}
            data-testid="library-empty-show-suppressed"
          >
            Show review imports
          </Link>
          <Link
            className="library-empty-state__secondary muted small"
            to="/library?scope=all"
            data-testid="library-empty-show-all"
          >
            Show all sources
          </Link>
        </div>
      </div>
    );
  }

  if (model.kind === 'search-empty') {
    const clearSearchHref = scope && scope !== 'all'
      ? `/library?scope=${encodeURIComponent(scope)}`
      : '/library?scope=all';
    return (
      <div className="library-empty-state library-empty-state--scoped" data-testid="library-empty-search">
        <div className="library-empty-state__copy">
          <span className="library-empty-state__eyebrow">Library · Search</span>
          <h3 className="library-empty-state__title">No sources match &ldquo;{model.query}&rdquo;</h3>
          {model.corpusTotal > 0 ? (
            <p className="library-empty-state__body">{formatLibraryCorpusCount(model.corpusTotal)}.</p>
          ) : null}
        </div>
        <div className="library-empty-state__actions">
          {onClearSearch ? (
            <button
              type="button"
              className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
              data-testid="library-empty-clear-search"
              onClick={() => onClearSearch()}
            >
              Clear search
            </button>
          ) : (
            <Link className="library-empty-state__primary ui-quiet-button" to={clearSearchHref}>
              Clear search
            </Link>
          )}
          <Link className="library-empty-state__secondary muted small" to="/library?scope=all">
            Search all Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="library-empty-state">
      <p className="muted">{model.emptyLabel || 'No articles here yet.'}</p>
      <Link className="library-empty-cta" to="/library?scope=all">
        Show all sources
      </Link>
    </div>
  );
};

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
  corpusTotal = 0,
  rawCorpusTotal = 0,
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
