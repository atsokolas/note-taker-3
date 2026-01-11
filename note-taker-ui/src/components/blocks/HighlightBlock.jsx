import React from 'react';
import { Link } from 'react-router-dom';
import { TagChip, QuietButton } from '../ui';

/**
 * @typedef {Object} Highlight
 * @property {string} [_id]
 * @property {string} [id]
 * @property {string} text
 * @property {string[]} [tags]
 * @property {string} [articleId]
 * @property {string} [articleTitle]
 * @property {string} [createdAt]
 */

/**
 * @param {{
 *  highlight: Highlight,
 *  onOpenArticle?: (highlight: Highlight) => void,
 *  onRemove?: (highlightId: string) => void,
 *  compact?: boolean
 * }} props
 */
const HighlightBlock = ({ highlight, onOpenArticle, onRemove, compact = false }) => {
  const highlightId = highlight._id || highlight.id || '';
  const hasArticle = Boolean(highlight.articleId || highlight.articleTitle);
  const handleOpenArticle = () => {
    if (onOpenArticle) {
      onOpenArticle(highlight);
    }
  };

  return (
    <div className={`highlight-block ${compact ? 'highlight-block--compact' : ''}`}>
      <div className="highlight-block-quote">“{highlight.text}”</div>
      {hasArticle && (
        <div className="highlight-block-meta">
          {highlight.articleId ? (
            <Link
              className="highlight-block-title"
              to={`/articles/${highlight.articleId}`}
              onClick={handleOpenArticle}
            >
              {highlight.articleTitle || 'Open article'}
            </Link>
          ) : (
            <span className="highlight-block-title">{highlight.articleTitle}</span>
          )}
          {highlight.createdAt && (
            <span className="muted small">
              {new Date(highlight.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
      {(highlight.tags || []).length > 0 && (
        <div className="highlight-block-tags">
          {highlight.tags.map(tag => (
            <TagChip key={`${highlightId}-${tag}`} to={`/think?view=concepts&concept=${encodeURIComponent(tag)}`}>
              {tag}
            </TagChip>
          ))}
        </div>
      )}
      {(onRemove || onOpenArticle) && (
        <div className="highlight-block-actions">
          {onOpenArticle && highlight.articleId && (
            <QuietButton onClick={handleOpenArticle}>Open article</QuietButton>
          )}
          {onRemove && highlightId && (
            <QuietButton onClick={() => onRemove(highlightId)}>Remove</QuietButton>
          )}
        </div>
      )}
    </div>
  );
};

export default HighlightBlock;
