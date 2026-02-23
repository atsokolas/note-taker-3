import React from 'react';
import { SectionHeader, SurfaceCard, TagChip, QuietButton } from '../ui';
import SkeletonBlock from '../SkeletonBlock';

const formatRelativeTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const deltaMs = Date.now() - parsed.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (deltaMs < hour) return `${Math.max(1, Math.round(deltaMs / minute))}m ago`;
  if (deltaMs < day) return `${Math.max(1, Math.round(deltaMs / hour))}h ago`;
  return `${Math.max(1, Math.round(deltaMs / day))}d ago`;
};

const HomeSkeleton = () => (
  <div className="think-home__skeleton-grid" aria-hidden="true">
    {Array.from({ length: 4 }).map((_, index) => (
      <div key={`home-skeleton-${index}`} className="think-home__skeleton-card">
        <SkeletonBlock width={`${30 + (index % 3) * 12}%`} height={12} />
        <SkeletonBlock width="100%" height={16} />
        <SkeletonBlock width="76%" height={12} />
      </div>
    ))}
  </div>
);

const Empty = ({ text }) => <p className="muted small">{text}</p>;

const ThinkHome = ({
  recentTargets = [],
  workingSet = { notebooks: [], concepts: [], questions: [] },
  returnQueue = [],
  recentHighlights = [],
  recentArticles = [],
  queueLoading = false,
  articlesLoading = false,
  loading = false,
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
      <div className="think-home__hero">
        <h2>Welcome back</h2>
        <p>Continue where you left off, then decide what to revisit or connect next.</p>
      </div>

      <SurfaceCard className="think-home__continue">
        <SectionHeader title="Continue" subtitle="Resume your latest active thread." />
        {continueItem ? (
          <button type="button" className="think-home__row" onClick={() => onOpenTarget(continueItem)}>
            <span className="think-home__row-title">{continueItem.title || 'Untitled'}</span>
            <span className="think-home__row-meta muted small">{formatRelativeTime(continueItem.openedAt)}</span>
          </button>
        ) : (
          <Empty text="No recent activity yet." />
        )}
      </SurfaceCard>

      <SurfaceCard className="think-home__panel">
        <SectionHeader title="Working set" subtitle="Recent notes, active concepts, and open questions." />
        {loading ? (
          <HomeSkeleton />
        ) : (
          <div className="think-home__working-grid">
            <div>
              <p className="think-home__column-title">Notebook</p>
              <div className="think-home__list">
                {workingSet.notebooks.length === 0 ? (
                  <Empty text="No notes yet." />
                ) : (
                  workingSet.notebooks.map((item) => (
                    <button key={item._id} type="button" className="think-home__row" onClick={() => onOpenNotebook(item._id)}>
                      <span className="think-home__row-title">{item.title || 'Untitled note'}</span>
                      <span className="think-home__row-meta muted small">{formatRelativeTime(item.updatedAt || item.createdAt)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="think-home__column-title">Concepts</p>
              <div className="think-home__list">
                {workingSet.concepts.length === 0 ? (
                  <Empty text="No concepts yet." />
                ) : (
                  workingSet.concepts.map((item) => (
                    <button key={item.name} type="button" className="think-home__row" onClick={() => onOpenConcept(item.name)}>
                      <span className="think-home__row-title">{item.name}</span>
                      <span className="think-home__row-meta muted small">{item.count || 0} highlights</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="think-home__column-title">Questions</p>
              <div className="think-home__list">
                {workingSet.questions.length === 0 ? (
                  <Empty text="No open questions." />
                ) : (
                  workingSet.questions.map((item) => (
                    <button key={item._id} type="button" className="think-home__row" onClick={() => onOpenQuestion(item._id)}>
                      <span className="think-home__row-title">{item.text || 'Untitled question'}</span>
                      <span className="think-home__row-meta muted small">{item.linkedTagName || 'Unscoped'}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </SurfaceCard>

      <div className="think-home__split-grid">
        <SurfaceCard className="think-home__panel">
          <SectionHeader title="Return queue" subtitle="Items due for re-encounter." />
          <div className="think-home__list">
            {queueLoading ? (
              <HomeSkeleton />
            ) : returnQueue.length === 0 ? (
              <Empty text="No return queue items." />
            ) : (
              returnQueue.map((entry) => (
                <button key={entry._id} type="button" className="think-home__row" onClick={() => onOpenReturnQueueItem(entry)}>
                  <span className="think-home__row-title">{entry.item?.title || `${entry.itemType} item`}</span>
                  <span className="think-home__row-meta muted small">{entry.reason || entry.itemType}</span>
                </button>
              ))
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard className="think-home__panel">
          <SectionHeader title="Recent material" subtitle="Highlights and source articles in motion." />
          <div className="think-home__material-block">
            <p className="think-home__column-title">Highlights</p>
            <div className="think-home__list">
              {recentHighlights.length === 0 ? (
                <Empty text="No highlights yet." />
              ) : (
                recentHighlights.slice(0, 6).map((item) => (
                  <div key={item._id} className="think-home__material-card">
                    <div className="think-home__material-title">{item.articleTitle || 'Highlight'}</div>
                    <div className="think-home__material-snippet">{(item.text || '').slice(0, 140)}</div>
                    <div>
                      <TagChip to={item.articleId ? `/articles/${item.articleId}` : '/library?scope=highlights'}>
                        Open source
                      </TagChip>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="think-home__material-block">
            <p className="think-home__column-title">Articles</p>
            <div className="think-home__list">
              {articlesLoading ? (
                <HomeSkeleton />
              ) : recentArticles.length === 0 ? (
                <Empty text="No recent articles." />
              ) : (
                recentArticles.map((item) => (
                  <button key={item._id} type="button" className="think-home__row" onClick={() => onOpenArticle(item._id)}>
                    <span className="think-home__row-title">{item.title || 'Untitled article'}</span>
                    <span className="think-home__row-meta muted small">{formatRelativeTime(item.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="think-home__footer-actions">
            <QuietButton onClick={() => window.location.href = '/library?scope=highlights'}>Open Library</QuietButton>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
};

export default React.memo(ThinkHome);
