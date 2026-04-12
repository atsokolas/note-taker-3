import React from 'react';
import { Button, QuietButton, SectionHeader } from '../../ui';

const SidebarSkeletonRows = ({ rows = 5 }) => (
  <div className="library-article-skeletons" aria-hidden="true">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={`think-thread-skeleton-${index}`} className="think-list-skeleton-row">
        <div className="skeleton skeleton-title" style={{ width: `${52 + (index % 3) * 14}%` }} />
        <div className="skeleton skeleton-text" style={{ width: `${28 + (index % 2) * 16}%` }} />
      </div>
    ))}
  </div>
);

const ThreadsSidebar = ({
  threadsModel,
  onOpenThread = () => {}
}) => {
  const {
    threads,
    threadsLoading,
    threadsError,
    threadStatusFilter,
    setThreadStatusFilter,
    threadScopeFilter,
    setThreadScopeFilter,
    threadCreateBusy,
    threadCreateError,
    activeThreadData,
    formatActor,
    formatScopeLabel,
    loadThreads,
    handleCreateThread
  } = threadsModel;

  return (
    <div className="section-stack think-layout__left-panel think-index think-threads-sidebar" data-testid="think-threads-left-panel">
      <SectionHeader
        title="Shared threads"
        subtitle="Resumable conversations for you, native agents, and personal agents."
        action={(
          <QuietButton type="button" onClick={loadThreads} disabled={threadsLoading}>
            Refresh
          </QuietButton>
        )}
      />

      <div className="think-index__controls">
        <div className="think-index__control-row">
          <label className="think-index__filter">
            <span>Status</span>
            <select
              value={threadStatusFilter}
              onChange={(event) => setThreadStatusFilter(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>
          <label className="think-index__filter">
            <span>Scope</span>
            <select
              value={threadScopeFilter}
              onChange={(event) => setThreadScopeFilter(event.target.value)}
            >
              <option value="all">All scopes</option>
              <option value="global">Global</option>
              <option value="workspace">Workspace</option>
              <option value="notebook">Notebook</option>
              <option value="concept">Concept</option>
              <option value="handoff">Handoff</option>
              <option value="selection">Selection</option>
              <option value="article">Article</option>
            </select>
          </label>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="think-index__new-question"
          onClick={handleCreateThread}
          disabled={threadCreateBusy}
        >
          {threadCreateBusy ? 'Creating…' : 'New thread'}
        </Button>
      </div>

      {threadsError && <p className="status-message error-message">{threadsError}</p>}
      {threadCreateError && <p className="status-message error-message">{threadCreateError}</p>}

      <div className="think-index__group">
        <div className="think-index__label">Timeline</div>
        <div className="think-index__list">
          {threadsLoading ? (
            <SidebarSkeletonRows rows={5} />
          ) : threads.length === 0 ? (
            <p className="think-calm-empty-line">No shared threads for this filter.</p>
          ) : (
            threads.map((thread) => {
              const threadId = String(thread?.threadId || '');
              const isActive = threadId && threadId === String(activeThreadData?.threadId || '');
              return (
                <button
                  key={threadId}
                  type="button"
                  className={`think-index__row think-thread-row ${isActive ? 'is-active' : ''}`}
                  onClick={() => onOpenThread(threadId)}
                >
                  <span className="think-index__row-title">{thread.title || 'Untitled thread'}</span>
                  <span className="think-thread-row__meta">
                    {formatScopeLabel(thread.scope)} · {formatActor(thread.lastActor || thread.createdBy)}
                  </span>
                  {thread.summary && (
                    <span className="think-thread-row__summary">{thread.summary}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ThreadsSidebar;
