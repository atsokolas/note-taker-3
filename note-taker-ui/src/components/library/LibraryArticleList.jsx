import React, { Profiler, useMemo } from 'react';
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
import { filterLibraryBrowseItems } from '../../utils/cruftSuppression';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

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

  return (
  <div
    className="library-article-row is-magnetic"
    onPointerMove={handlePointerMove}
    onPointerLeave={handlePointerLeave}
  >
    <div className="library-article-row-date">{formatDate(rowDate)}</div>
    <button
      className="library-article-row-main"
      type="button"
      aria-label={`Open in Reading Room: ${article.title || 'Untitled article'}`}
      data-testid="library-article-open"
      onClick={() => onSelectArticle(article._id)}
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
          onMoveArticle(article);
        }}
      >
        Move
      </button>
    )}
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
  suppressedVisible = false
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
        scope === 'all' || scope === 'unfiled' ? (
          <div className="library-empty-state library-empty-state--first-run" data-testid="library-empty-first-run">
            <div className="library-empty-state__copy">
              <span className="library-empty-state__eyebrow">Library</span>
              <h3 className="library-empty-state__title">Save your first article</h3>
              <p className="library-empty-state__body">
                Use the browser extension to save and highlight from any page on the web.
                Articles you save show up here, ready to read, highlight, and turn into concepts.
              </p>
            </div>
            <div className="library-empty-state__actions">
              <a
                className="ui-quiet-button ui-quiet-button--primary library-empty-state__primary"
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
        ) : (
          <div className="library-empty-state">
            <p className="muted">{emptyLabel || 'No articles here yet.'}</p>
            <Link className="library-empty-cta" to="/library?scope=all">
              Move articles into this folder
            </Link>
          </div>
        )
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
