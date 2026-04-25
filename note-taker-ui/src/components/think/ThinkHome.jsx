import React from 'react';
import { SectionHeader, QuietButton } from '../ui';
import SkeletonBlock from '../SkeletonBlock';
import { getFirstInsightSummary, isFirstInsightActive } from '../../utils/firstInsight';

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
    {Array.from({ length: 5 }).map((_, index) => (
      <div key={`home-skeleton-${index}`} className="think-home__skeleton-row">
        <SkeletonBlock width={`${42 + (index % 2) * 14}%`} height={12} />
        <SkeletonBlock width={`${18 + (index % 3) * 6}%`} height={10} />
      </div>
    ))}
  </div>
);

const Empty = ({ text }) => <p className="muted small">{text}</p>;

const HomeRow = ({ title, meta, onClick, className = '' }) => (
  <button type="button" className={`think-home__row think-home-editorial-row ${className}`.trim()} onClick={onClick}>
    <span className="think-home__row-title think-home-editorial-row__title">{title}</span>
    {meta ? <span className="think-home__row-meta think-home-editorial-row__meta muted small">{meta}</span> : null}
  </button>
);

const TYPE_LABELS = {
  notebook: 'Notebook',
  concept: 'Concept',
  question: 'Question',
  article: 'Article',
  highlight: 'Highlight'
};

const ContinueHero = ({ item, meta, onResume }) => {
  const typeLabel = TYPE_LABELS[item?.type] || (item?.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : 'Recent');
  return (
    <div className="think-home-editorial__continue-hero">
      <div className="think-home-editorial__continue-hero-copy">
        <span className="think-home-editorial__continue-hero-eyebrow">{typeLabel}</span>
        <button
          type="button"
          className="think-home-editorial__continue-hero-title-button"
          onClick={onResume}
          aria-label={`Resume ${item?.title || 'untitled'}`}
        >
          {item?.title || 'Untitled'}
        </button>
        {meta ? <span className="think-home-editorial__continue-hero-meta muted small">{meta}</span> : null}
      </div>
      <div className="think-home-editorial__continue-hero-cta">
        <QuietButton variant="primary" onClick={onResume}>Resume</QuietButton>
      </div>
    </div>
  );
};

const MaterialRow = ({ title, snippet, meta, onClick }) => (
  <button type="button" className="think-home__material-row think-home-editorial-material-row" onClick={onClick}>
    <div className="think-home__material-copy think-home-editorial-material-row__copy">
      <span className="think-home__material-title think-home-editorial-material-row__title">{title}</span>
      {snippet ? <span className="think-home__material-snippet think-home-editorial-material-row__snippet">{snippet}</span> : null}
    </div>
    {meta ? <span className="think-home__material-meta think-home-editorial-material-row__meta muted small">{meta}</span> : null}
  </button>
);

const ThinkHome = ({
  showHero = false,
  heroEyebrow = 'Workspace orientation',
  heroTitle = 'Think',
  heroSubtitle = 'Home for your notebook, concepts, and open questions.',
  recentTargets = [],
  workingSet = { notebooks: [], concepts: [], questions: [] },
  returnQueue = [],
  recentHighlights = [],
  recentArticles = [],
  queueLoading = false,
  articlesLoading = false,
  loading = false,
  activationState = null,
  onOpenTarget = () => {},
  onOpenNotebook = () => {},
  onOpenConcept = () => {},
  onOpenQuestion = () => {},
  onOpenReturnQueueItem = () => {},
  onOpenArticle = () => {},
  onOpenActivation = () => {},
  onClearActivation = () => {},
  onCreateNote = () => {},
  onCreateConcept = () => {},
  onCreateFromTemplate = () => {},
  onCreateQuestion = () => {}
}) => {
  const continueItem = recentTargets[0] || null;
  const continueMeta = [
    continueItem?.type || '',
    formatRelativeTime(continueItem?.openedAt)
  ].filter(Boolean).join(' · ');

  return (
    <div className="think-home think-home-editorial section-stack">
      {showHero && (
        <header className="think-home-editorial__hero">
          <div className="think-home-editorial__hero-eyebrow">{heroEyebrow}</div>
          <h1 className="think-home-editorial__hero-title">{heroTitle}</h1>
          <p className="think-home-editorial__hero-subtitle">{heroSubtitle}</p>
        </header>
      )}

      {isFirstInsightActive(activationState) && (
        <section className="think-home-editorial__notice first-insight-card">
          <SectionHeader title="First insight in progress" subtitle="Keep the capture-to-revisit loop moving." />
          <p className="first-insight-summary">{getFirstInsightSummary(activationState)}</p>
          <div className="think-home-editorial__notice-actions">
            <QuietButton onClick={onOpenActivation}>Open thread</QuietButton>
            <QuietButton onClick={onClearActivation}>Clear</QuietButton>
          </div>
        </section>
      )}

      <div
        className="think-home-editorial__launchpad think-home-editorial__launchpad--split"
        role="toolbar"
        aria-label="Think actions"
      >
        <div className="think-home-editorial__launchpad-primary">
          <QuietButton variant="primary" onClick={onCreateNote}>New note</QuietButton>
        </div>
        <div className="think-home-editorial__launchpad-secondary">
          <QuietButton onClick={onCreateConcept}>New concept</QuietButton>
          <QuietButton onClick={onCreateFromTemplate}>Use template</QuietButton>
          <QuietButton onClick={onCreateQuestion}>New question</QuietButton>
        </div>
      </div>

      <section className="think-home__continue think-home-editorial__section">
        <SectionHeader title="Continue" subtitle="Pick up your latest thread, or start something new without leaving Think." />
        {continueItem ? (
          <ContinueHero
            item={continueItem}
            meta={continueMeta}
            onResume={() => onOpenTarget(continueItem)}
          />
        ) : (
          <Empty text="No recent activity yet." />
        )}
      </section>

      <section className="think-home__panel think-home-editorial__section">
        <SectionHeader title="Working set" subtitle="Recent notes, active concepts, and open questions." />
        {loading ? (
          <HomeSkeleton />
        ) : (
          <div className="think-home__working-grid think-home-editorial__working-grid think-home-editorial-ledger">
            <section className="think-home__working-column think-home-editorial-column">
              <p className="think-home__column-title">Notebook</p>
              <div className="think-home__list think-home__list--scannable think-home-editorial-list">
                {workingSet.notebooks.length === 0 ? (
                  <Empty text="No notes yet." />
                ) : (
                  workingSet.notebooks.slice(0, 5).map((item) => (
                    <HomeRow
                      key={item._id}
                      title={item.title || 'Untitled note'}
                      meta={formatRelativeTime(item.updatedAt || item.createdAt)}
                      className="think-home__row--scannable"
                      onClick={() => onOpenNotebook(item._id)}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="think-home__working-column think-home-editorial-column">
              <p className="think-home__column-title">Concepts</p>
              <div className="think-home__list think-home__list--scannable think-home-editorial-list">
                {workingSet.concepts.length === 0 ? (
                  <Empty text="No concepts yet." />
                ) : (
                  workingSet.concepts.slice(0, 5).map((item) => (
                    <HomeRow
                      key={item.name}
                      title={item.name}
                      meta={`${item.count || 0} highlights`}
                      className="think-home__row--scannable"
                      onClick={() => onOpenConcept(item.name)}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="think-home__working-column think-home-editorial-column">
              <p className="think-home__column-title">Questions</p>
              <div className="think-home__list think-home__list--scannable think-home-editorial-list">
                {workingSet.questions.length === 0 ? (
                  <Empty text="No open questions." />
                ) : (
                  workingSet.questions.slice(0, 5).map((item) => (
                    <HomeRow
                      key={item._id}
                      title={item.text || 'Untitled question'}
                      meta={item.linkedTagName || 'Unscoped'}
                      className="think-home__row--scannable"
                      onClick={() => onOpenQuestion(item._id)}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </section>

      <div className="think-home__split-grid think-home-editorial__split-grid">
        <section className="think-home__panel think-home-editorial__section">
          <SectionHeader title="Return queue" subtitle="Items due for re-encounter." />
          <div className="think-home__list think-home__list--scannable think-home-editorial-list">
            {queueLoading ? (
              <HomeSkeleton />
            ) : returnQueue.length === 0 ? (
              <Empty text="No return queue items." />
            ) : (
              returnQueue.map((entry) => (
                <HomeRow
                  key={entry._id}
                  title={entry.item?.title || `${entry.itemType} item`}
                  meta={entry.reason || entry.itemType}
                  className="think-home__row--scannable"
                  onClick={() => onOpenReturnQueueItem(entry)}
                />
              ))
            )}
          </div>
        </section>

        <section className="think-home__panel think-home-editorial__section">
          <SectionHeader title="Recent material" subtitle="Highlights and source articles in motion." />

          <div className="think-home__material-block">
            <p className="think-home__column-title">Highlights</p>
            <div className="think-home__list think-home__list--scannable think-home-editorial-list">
              {recentHighlights.length === 0 ? (
                <Empty text="No highlights yet." />
              ) : (
                recentHighlights.slice(0, 6).map((item) => (
                  <MaterialRow
                    key={item._id}
                    title={item.articleTitle || 'Highlight'}
                    snippet={(item.text || '').slice(0, 180)}
                    onClick={() => {
                      if (item.articleId) {
                        onOpenArticle(item.articleId);
                        return;
                      }
                      window.location.href = '/library?scope=highlights';
                    }}
                  />
                ))
              )}
            </div>
          </div>

          <div className="think-home__material-block">
            <p className="think-home__column-title">Articles</p>
            <div className="think-home__list think-home__list--scannable think-home-editorial-list">
              {articlesLoading ? (
                <HomeSkeleton />
              ) : recentArticles.length === 0 ? (
                <Empty text="No recent articles." />
              ) : (
                recentArticles.map((item) => (
                  <MaterialRow
                    key={item._id}
                    title={item.title || 'Untitled article'}
                    meta={formatRelativeTime(item.createdAt)}
                    onClick={() => onOpenArticle(item._id)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="think-home__footer-actions">
            <QuietButton onClick={() => { window.location.href = '/library?scope=highlights'; }}>Open Library</QuietButton>
          </div>
        </section>
      </div>
    </div>
  );
};

export default React.memo(ThinkHome);
