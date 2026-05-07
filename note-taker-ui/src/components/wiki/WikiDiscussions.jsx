import React from 'react';
import renderTiptapDoc from './renderTiptapDoc';

/**
 * WikiDiscussions — reverse-chronological log of Q&A turns about this
 * page. Each answer is rendered with the same `wiki-claim` markup the
 * editor uses, so the citation popover (mounted by WikiPageEditor at the
 * page level) lights up on hover with no extra plumbing.
 *
 * Discussions live above the composer so the user sees their history
 * when they scroll into "Ask this page."
 */

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Math.round((now - then) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const WikiDiscussions = ({ discussions = [], onRemove }) => {
  if (!Array.isArray(discussions) || discussions.length === 0) return null;
  // Reverse-chrono so the newest answer sits closest to the composer.
  const ordered = discussions.slice().sort((a, b) => {
    const at = new Date(b?.askedAt || 0).getTime();
    const bt = new Date(a?.askedAt || 0).getTime();
    return at - bt;
  });

  return (
    <section className="wiki-discussions" aria-label="Past questions about this page">
      <header className="wiki-discussions__header">
        <h3 className="wiki-discussions__title">Discussions</h3>
        <span className="wiki-discussions__count">
          {ordered.length} question{ordered.length === 1 ? '' : 's'}
        </span>
      </header>
      <ol className="wiki-discussions__list">
        {ordered.map((discussion) => (
          <li
            key={discussion._id || discussion.askedAt}
            className={`wiki-discussions__item wiki-discussions__item--${discussion.status || 'answered'}`}
            data-testid="wiki-discussion-item"
          >
            <div className="wiki-discussions__item-head">
              <span className="wiki-discussions__item-meta">
                Asked {formatRelativeTime(discussion.askedAt)}
                {discussion.model ? ` · ${discussion.model}` : ''}
              </span>
              {onRemove && discussion._id ? (
                <button
                  type="button"
                  className="wiki-discussions__remove"
                  onClick={() => onRemove(discussion._id)}
                  aria-label="Remove discussion"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="wiki-discussions__question">{discussion.question}</p>
            <div className="wiki-discussions__answer">
              {renderTiptapDoc(discussion.answer) || (
                <p className="wiki-discussions__empty">No answer yet.</p>
              )}
            </div>
            {discussion.status === 'failed' && discussion.errorMessage ? (
              <p className="wiki-discussions__error">{discussion.errorMessage}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
};

export default WikiDiscussions;
