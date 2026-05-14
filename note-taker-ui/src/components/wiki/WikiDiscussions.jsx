import React, { useState } from 'react';
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

const suggestTitle = (question = '') => {
  const title = String(question || '')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
  return title || 'Answer from discussion';
};

const PromoteTitleModal = ({
  title,
  onTitleChange,
  onCancel,
  onSubmit,
  isPromoting
}) => (
  <div className="wiki-discussions__modal-backdrop" role="presentation">
    <form
      className="wiki-discussions__modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wiki-discussions-promote-title"
      onSubmit={(event) => {
        event.preventDefault();
        const nextTitle = title.trim();
        if (nextTitle) onSubmit(nextTitle);
      }}
    >
      <h2 id="wiki-discussions-promote-title">Save answer as wiki page</h2>
      <p>Choose the title for the new wiki page.</p>
      <label>
        <span>Page title</span>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          aria-label="New wiki page title"
        />
      </label>
      <div className="wiki-discussions__modal-actions">
        <button type="button" onClick={onCancel} disabled={isPromoting}>
          Cancel
        </button>
        <button type="submit" disabled={isPromoting || !title.trim()}>
          {isPromoting ? 'Saving...' : 'Save page'}
        </button>
      </div>
    </form>
  </div>
);

const WikiDiscussions = ({ discussions = [], onRemove, onPromote, promotingId = '' }) => {
  const [promoteDraft, setPromoteDraft] = useState({ id: '', title: '' });
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
        {ordered.map((discussion) => {
          const discussionId = discussion._id || '';
          const canPromote = Boolean(onPromote && discussionId && discussion.status !== 'failed');
          const isPromoteOpen = promoteDraft.id === discussionId;
          const isPromoting = String(promotingId || '') === String(discussionId);
          return (
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
            {canPromote ? (
              <div className="wiki-discussions__promote">
                {isPromoteOpen ? (
                  <PromoteTitleModal
                    title={promoteDraft.title}
                    onTitleChange={(title) => setPromoteDraft({ id: discussionId, title })}
                    onCancel={() => setPromoteDraft({ id: '', title: '' })}
                    onSubmit={(title) => onPromote(discussion, title)}
                    isPromoting={isPromoting}
                  />
                ) : (
                  <button
                    type="button"
                    className="wiki-discussions__promote-button"
                    onClick={() => setPromoteDraft({ id: discussionId, title: suggestTitle(discussion.question) })}
                  >
                    Save as wiki page
                  </button>
                )}
              </div>
            ) : null}
          </li>
          );
        })}
      </ol>
    </section>
  );
};

export default WikiDiscussions;
