import React from 'react';
import { Link } from 'react-router-dom';
import { Button, QuietButton, SectionHeader, SurfaceCard } from '../ui';
import { getThreadMotionStateTag, getWikiOpenQuestionHref } from './calmIndexModel';

const ThreadAction = ({ thread, className, children, onSelectThread }) => {
  const sourceHref = thread?.type === 'question' ? getWikiOpenQuestionHref(thread.raw) : '';
  if (sourceHref) {
    return (
      <Link to={sourceHref} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => onSelectThread?.(thread)}
    >
      {children}
    </button>
  );
};

const CalmIndexView = ({
  eyebrow = 'Think',
  orientation = '',
  motion = { inMotion: [], shelf: [] },
  loading = false,
  error = '',
  emptyState = null,
  showPostureTag = false,
  describeMotionNote,
  onSelectThread,
  actions = null,
  homeCommand = null,
  homeLinks = null,
  maintenanceNote = '',
  motionStatusTestIdPrefix = 'think-calm-status'
}) => {
  const hasThreads = (motion.inMotion?.length || 0) + (motion.shelf?.length || 0) > 0;

  return (
    <div className="think-calm-index tix" data-testid="think-calm-index">
      <div className="think-calm-index__hero tix-anim tix-anim--1">
        <div className="think-calm-index__eyebrow">{eyebrow}</div>
        <h1 className="tix-lead">{orientation}</h1>
      </div>

      {error ? <p className="status-message error-message">{error}</p> : null}

      {loading ? (
        <div className="think-concept-loading" aria-hidden="true">
          <div className="skeleton skeleton-title" style={{ width: '34%', height: 16 }} />
          <div className="skeleton skeleton-title" style={{ width: '62%', height: 28 }} />
          <div className="skeleton skeleton-text" style={{ width: '96%', height: 14 }} />
          <div className="skeleton skeleton-text" style={{ width: '88%', height: 14 }} />
          <div className="skeleton skeleton-text" style={{ width: '92%', height: 14 }} />
        </div>
      ) : (
        <>
          {hasThreads ? (
            <div className="think-calm-index__list tix-list">
              {motion.inMotion?.length > 0 ? (
                <section className="tix-motion tix-anim tix-anim--2" aria-label="In motion">
                  <h2 className="tix-eyebrow">In motion</h2>
                  <div className="tix-motion__list">
                    {motion.inMotion.map((thread) => (
                      <ThreadAction
                        key={thread.key}
                        className={`tix-thread ${thread.stale ? 'is-stale' : ''}`.trim()}
                        thread={thread}
                        onSelectThread={onSelectThread}
                      >
                        {showPostureTag ? (
                          <span className="tix-thread__tag">{getThreadMotionStateTag(thread)}</span>
                        ) : null}
                        <span className="tix-thread__title">{thread.title}</span>
                        <span
                          className="tix-thread__note"
                          data-testid={`${motionStatusTestIdPrefix}-${encodeURIComponent(thread.key)}`}
                        >
                          {describeMotionNote?.(thread)}
                        </span>
                        {thread.description ? (
                          <span className="tix-thread__desc">{thread.description}</span>
                        ) : null}
                      </ThreadAction>
                    ))}
                  </div>
                </section>
              ) : null}

              {motion.shelf?.length > 0 ? (
                <section className="tix-shelf tix-anim tix-anim--3" aria-label="On the shelf">
                  <h2 className="tix-eyebrow">On the shelf</h2>
                  <p className="tix-shelf__index">
                    {motion.shelf.map((thread, index) => (
                      <React.Fragment key={thread.key}>
                        {index > 0 ? <span aria-hidden="true" className="tix-shelf__dot"> · </span> : null}
                        <ThreadAction
                          thread={thread}
                          className="tix-shelf__link"
                          onSelectThread={onSelectThread}
                        >
                          {thread.title}
                        </ThreadAction>
                      </React.Fragment>
                    ))}
                  </p>
                </section>
              ) : null}
            </div>
          ) : emptyState ? (
            emptyState
          ) : (
            <SurfaceCard className="think-concepts-empty-state" data-testid="think-calm-empty-state">
              <SectionHeader title="Nothing here yet" subtitle="Start a thread and it will show up in motion." />
            </SurfaceCard>
          )}

          {homeCommand ? (
            <div className="think-calm-index__command tix-anim tix-anim--4">
              {homeCommand}
            </div>
          ) : null}

          {actions ? (
            <div className="tix-actions tix-anim tix-anim--4">
              {actions}
            </div>
          ) : null}

          {homeLinks ? (
            <div className="think-calm-index__links tix-anim tix-anim--4">
              {homeLinks}
            </div>
          ) : null}

          {maintenanceNote ? (
            <p
              className="think-calm-index__maintenance muted small"
              data-testid="think-cruft-notice"
            >
              {maintenanceNote}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};

export const ConceptIndexEmptyState = ({
  allCount = 0,
  search = '',
  onOpenComposer,
  onOpenTemplatePicker,
  renderConceptComposer,
  walkthroughLink = null
}) => {
  if (allCount === 0) {
    return (
      <SurfaceCard className="think-concepts-empty-state think-concepts-empty-state--first-run" data-testid="think-concepts-empty-state">
        <div className="think-concepts-empty-state__copy">
          <span className="think-concepts-empty-state__eyebrow">Concepts</span>
          <h3 className="think-concepts-empty-state__title">Create your first concept</h3>
          <p className="think-concepts-empty-state__body">
            A concept is the page where old reading turns back into usable thought.
            Create one to gather support, tension, and open questions around an idea
            you keep returning to.
          </p>
        </div>
        <div className="think-concept-composer-anchor think-concepts-empty-state__actions">
          <Button
            variant="primary"
            onClick={() => onOpenComposer?.('empty', search)}
            data-testid="think-concepts-empty-create-button"
          >
            Create your first concept
          </Button>
          {walkthroughLink}
          {renderConceptComposer?.('empty')}
        </div>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="think-concepts-empty-state" data-testid="think-concepts-empty-state">
      <SectionHeader title="No concepts match" subtitle="Try a different search term, or clear the filter to see everything." />
      <div className="think-concept-composer-anchor think-concepts-empty-state__actions">
        <Button
          variant="secondary"
          onClick={() => onOpenComposer?.('empty', search)}
          data-testid="think-concepts-empty-create-button"
        >
          Create concept
        </Button>
        <QuietButton onClick={onOpenTemplatePicker}>Use template</QuietButton>
        {renderConceptComposer?.('empty')}
      </div>
    </SurfaceCard>
  );
};

export const QuestionIndexEmptyState = ({ onCreateQuestion, questionSaving = false }) => (
  <SurfaceCard className="think-concepts-empty-state think-concepts-empty-state--first-run" data-testid="think-questions-empty-state">
    <div className="think-concepts-empty-state__copy">
      <span className="think-concepts-empty-state__eyebrow">Questions</span>
      <h3 className="think-concepts-empty-state__title">Capture your first question</h3>
      <p className="think-concepts-empty-state__body">
        A question keeps the dialectical loop open until the evidence is tight enough to answer.
      </p>
    </div>
    <div className="think-concepts-empty-state__actions">
      <Button variant="primary" onClick={onCreateQuestion} disabled={questionSaving} data-testid="think-questions-empty-create-button">
        New question
      </Button>
    </div>
  </SurfaceCard>
);

export const NotebookIndexEmptyState = ({ onCreateNotebookEntry }) => (
  <SurfaceCard className="think-concepts-empty-state think-concepts-empty-state--first-run" data-testid="think-notebook-empty-state">
    <div className="think-concepts-empty-state__copy">
      <span className="think-concepts-empty-state__eyebrow">Notebook</span>
      <h3 className="think-concepts-empty-state__title">Start your first page</h3>
      <p className="think-concepts-empty-state__body">
        Notebook pages stay loose until they are ready to become concepts, questions, or settled writing.
      </p>
    </div>
    <div className="think-concepts-empty-state__actions">
      <Button variant="primary" onClick={onCreateNotebookEntry} data-testid="think-notebook-empty-create-button">
        New page
      </Button>
    </div>
  </SurfaceCard>
);

export default CalmIndexView;
