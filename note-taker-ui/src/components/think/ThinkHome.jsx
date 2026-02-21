import React from 'react';
import { SectionHeader, SurfaceCard, TagChip } from '../ui';

const formatRelativeTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const deltaMs = Date.now() - parsed.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (deltaMs < hour) {
    const mins = Math.max(1, Math.round(deltaMs / minute));
    return `${mins}m ago`;
  }
  if (deltaMs < day) {
    const hours = Math.max(1, Math.round(deltaMs / hour));
    return `${hours}h ago`;
  }
  const days = Math.max(1, Math.round(deltaMs / day));
  return `${days}d ago`;
};

const ThinkHome = ({
  recentTargets = [],
  workingSet = { notebooks: [], concepts: [], questions: [] },
  returnQueue = [],
  recentHighlights = [],
  recentArticles = [],
  queueLoading = false,
  articlesLoading = false,
  onOpenTarget = () => {},
  onOpenNotebook = () => {},
  onOpenConcept = () => {},
  onOpenQuestion = () => {},
  onOpenReturnQueueItem = () => {},
  onOpenArticle = () => {}
}) => {
  const continueItem = recentTargets[0] || null;

  return (
    <div className="think-home section-stack">
      <SurfaceCard>
        <SectionHeader title="Continue" subtitle="Jump back into your latest thread." />
        {!continueItem ? (
          <p className="muted small">No recent activity yet. Open a note, concept, or question to start your trail.</p>
        ) : (
          <button type="button" className="think-home__continue" onClick={() => onOpenTarget(continueItem)}>
            <div>
              <p className="think-home__kicker">{continueItem.type}</p>
              <h3>{continueItem.title || 'Untitled'}</h3>
            </div>
            <span className="muted small">{formatRelativeTime(continueItem.openedAt)}</span>
          </button>
        )}
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader title="Working set" subtitle="Recent notes, active concepts, open questions." />
        <div className="think-home__working-grid">
          <div>
            <p className="think-home__column-title">Notebook</p>
            <div className="think-home__list">
              {workingSet.notebooks.length === 0 ? (
                <p className="muted small">No notes yet.</p>
              ) : (
                workingSet.notebooks.map(item => (
                  <button key={item._id} type="button" className="think-home__row" onClick={() => onOpenNotebook(item._id)}>
                    <span>{item.title || 'Untitled note'}</span>
                    <span className="muted small">{formatRelativeTime(item.updatedAt || item.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="think-home__column-title">Concepts</p>
            <div className="think-home__list">
              {workingSet.concepts.length === 0 ? (
                <p className="muted small">No concepts yet.</p>
              ) : (
                workingSet.concepts.map(item => (
                  <button key={item.name} type="button" className="think-home__row" onClick={() => onOpenConcept(item.name)}>
                    <span>{item.name}</span>
                    <span className="muted small">{item.count || 0} highlights</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="think-home__column-title">Questions</p>
            <div className="think-home__list">
              {workingSet.questions.length === 0 ? (
                <p className="muted small">No open questions.</p>
              ) : (
                workingSet.questions.map(item => (
                  <button key={item._id} type="button" className="think-home__row" onClick={() => onOpenQuestion(item._id)}>
                    <span>{item.text || 'Untitled question'}</span>
                    <span className="muted small">{item.linkedTagName || 'Unscoped'}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </SurfaceCard>

      <div className="think-home__split-grid">
        <SurfaceCard>
          <SectionHeader title="Return queue" subtitle="Items due for re-encounter." />
          <div className="think-home__list">
            {queueLoading ? (
              <p className="muted small">Loading return queue...</p>
            ) : returnQueue.length === 0 ? (
              <p className="muted small">No return queue items.</p>
            ) : (
              returnQueue.map(entry => (
                <button key={entry._id} type="button" className="think-home__row" onClick={() => onOpenReturnQueueItem(entry)}>
                  <span>{entry.item?.title || `${entry.itemType} item`}</span>
                  <span className="muted small">{entry.reason || entry.itemType}</span>
                </button>
              ))
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader title="Recent material" subtitle="Fresh highlights and source articles." />
          <div className="think-home__material-block">
            <p className="think-home__column-title">Highlights</p>
            <div className="think-home__chips">
              {recentHighlights.length === 0 ? (
                <p className="muted small">No highlights yet.</p>
              ) : (
                recentHighlights.map(item => (
                  <TagChip key={item._id} to={item.articleId ? `/articles/${item.articleId}` : '/library?scope=highlights'}>
                    {(item.articleTitle || item.text || 'Highlight').slice(0, 46)}
                  </TagChip>
                ))
              )}
            </div>
          </div>
          <div className="think-home__material-block">
            <p className="think-home__column-title">Articles</p>
            <div className="think-home__list">
              {articlesLoading ? (
                <p className="muted small">Loading articles...</p>
              ) : recentArticles.length === 0 ? (
                <p className="muted small">No recent articles.</p>
              ) : (
                recentArticles.map(item => (
                  <button key={item._id} type="button" className="think-home__row" onClick={() => onOpenArticle(item._id)}>
                    <span>{item.title || 'Untitled article'}</span>
                    <span className="muted small">{formatRelativeTime(item.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
};

export default React.memo(ThinkHome);
