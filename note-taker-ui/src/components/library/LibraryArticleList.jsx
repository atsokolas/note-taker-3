import React from 'react';
import { Link } from 'react-router-dom';

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
 *  onSelectArticle: (id: string) => void
 * }} props
 */
const LibraryArticleList = ({
  articles,
  loading,
  error,
  emptyLabel,
  onSelectArticle
}) => (
  <div className="library-article-list">
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
      <button
        key={article._id}
        className="library-article-row"
        onClick={() => onSelectArticle(article._id)}
      >
        <div className="library-article-row-title">{article.title || 'Untitled article'}</div>
        <div className="library-article-row-meta">
          <span>{formatDate(article.createdAt)}</span>
          <span>{(article.highlights || []).length} highlights</span>
        </div>
      </button>
    ))}
  </div>
);

export default LibraryArticleList;
