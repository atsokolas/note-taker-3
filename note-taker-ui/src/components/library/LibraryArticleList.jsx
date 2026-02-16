import React from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../ui';

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
const LibraryArticleList = ({
  articles,
  loading,
  error,
  emptyLabel,
  onSelectArticle,
  onMoveArticle
}) => (
  <div className="library-article-list">
    <SectionHeader
      title="Articles"
      subtitle="Saved reads and source material."
      className="library-section-head is-articles"
    />
    {loading && <p className="muted small">Loading articles…</p>}
    {error && <p className="status-message error-message">{error}</p>}
    {!loading && !error && articles.length === 0 && (
      <div className="library-empty-state">
        <p className="muted">{emptyLabel || 'No articles here yet.'}</p>
        <Link className="library-empty-cta" to="/library?scope=all">
          Move articles into this folder
        </Link>
      </div>
    )}
    {!loading && !error && articles.map(article => (
      <div key={article._id} className="library-article-row">
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
    ))}
  </div>
);

export default LibraryArticleList;
