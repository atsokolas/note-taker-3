import React, { Profiler, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../ui';
import VirtualList from '../virtual/VirtualList';
import { createProfilerLogger } from '../../utils/perf';
import { TOUR_EXTENSION_URL } from '../../tour/tourConfig';

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

const getArticleTags = (article) => {
  if (Array.isArray(article?.tags) && article.tags.length > 0) return article.tags.slice(0, 3);
  if (Array.isArray(article?.concepts) && article.concepts.length > 0) {
    return article.concepts
      .map((item) => item?.name || item?.tag || item)
      .filter(Boolean)
      .slice(0, 3);
  }
  return [];
};

const getExcerpt = (article) => {
  const raw = article?.summary || article?.description || article?.excerpt || article?.previewText || article?.snippet || '';
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return 'Open this source in the reading room and use highlights, notes, and concepts as marginalia.';
  }
  if (text.length <= 180) return text;
  return `${text.slice(0, 177)}...`;
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
const ARTICLE_ROW_HEIGHT = 92;
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
  const excerpt = getExcerpt(article);
  const highlightCount = Number(article?.highlightCount ?? article?.highlights?.length ?? 0);

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
    <div className="library-article-row-date">{formatDate(article.createdAt)}</div>
    <button
      className="library-article-row-main"
      onClick={() => onSelectArticle(article._id)}
    >
      <div className="library-article-row-title">{article.title || 'Untitled article'}</div>
      <div className="library-article-row-kicker">
        <span className="library-article-row-source">{sourceLabel}</span>
        {tags.map((tag) => (
          <span key={`${article._id}-${tag}`} className="library-article-row-tag">#{tag}</span>
        ))}
      </div>
      <div className="library-article-row-excerpt">{excerpt}</div>
      <div className="library-article-row-meta">
        <span>{highlightCount} highlights</span>
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
  scope = 'all'
}) => {
  const hasError = Boolean(error);
  const isEmpty = !loading && !hasError && articles.length === 0;
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
      {loading && (
        <div className="library-article-skeletons">
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <ArticleRowSkeleton key={`article-skeleton-${index}`} />
          ))}
        </div>
      )}
      {error && <p className="status-message error-message">{error}</p>}
      {!loading && !error && articles.length === 0 && (
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
          {articles.length > 40 ? (
            <VirtualList
              items={articles}
              height={virtualHeight}
              itemSize={ARTICLE_ROW_HEIGHT}
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
            articles.map(article => (
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
