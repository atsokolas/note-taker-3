import React, { Profiler, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../ui';
import VirtualList from '../virtual/VirtualList';
import { createProfilerLogger } from '../../utils/perf';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
}) => (
  <div className="library-article-row">
    <button
      className="library-article-row-main"
      onClick={() => onSelectArticle(article._id)}
    >
      <div className="library-article-row-title">{article.title || 'Untitled article'}</div>
      <div className="library-article-row-meta">
        <span>{formatDate(article.createdAt)}</span>
        <span>{(article.highlights || []).length} highlights</span>
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
));

const LibraryArticleList = ({
  articles,
  loading,
  error,
  emptyLabel,
  onSelectArticle,
  onMoveArticle
}) => {
  const virtualHeight = useMemo(() => {
    const viewport = typeof window !== 'undefined' ? window.innerHeight : 0;
    return Math.min(680, Math.max(320, viewport ? viewport - 290 : 560));
  }, []);

  return (
    <div className="library-article-list">
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
        <div className="library-empty-state">
          <p className="muted">{emptyLabel || 'No articles here yet.'}</p>
          <Link className="library-empty-cta" to="/library?scope=all">
            Move articles into this folder
          </Link>
        </div>
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
