import React from 'react';
import { Link } from 'react-router-dom';
import { Button, QuietButton, SectionHeader, SurfaceCard } from '../../ui';

const ConceptsIndexView = ({
  orientation,
  conceptsError,
  conceptsLoading,
  filteredConcepts,
  motion,
  allConceptsCount,
  search,
  onSelectConcept,
  onOpenComposer,
  onOpenTemplatePicker,
  renderConceptComposer,
  describeMotionNote
}) => (
  <div className="think-concepts-index-surface tix">
    {/* AT-329: calm inversion. The door opens on the agent's orientation,
        where your own momentum is, not on an imperative console. */}
    <div className="think-concepts-index-hero tix-anim tix-anim--1">
      <div className="think-concepts-index-hero__eyebrow">Think</div>
      <h1 className="tix-lead">{orientation}</h1>
    </div>
    {conceptsError && <p className="status-message error-message">{conceptsError}</p>}
    {conceptsLoading ? (
      <div className="think-concept-loading" aria-hidden="true">
        <div className="skeleton skeleton-title" style={{ width: '34%', height: 16 }} />
        <div className="skeleton skeleton-title" style={{ width: '62%', height: 28 }} />
        <div className="skeleton skeleton-text" style={{ width: '96%', height: 14 }} />
        <div className="skeleton skeleton-text" style={{ width: '88%', height: 14 }} />
        <div className="skeleton skeleton-text" style={{ width: '92%', height: 14 }} />
      </div>
    ) : filteredConcepts.length > 0 ? (
      <div className="think-concepts-index-list tix-list">
        <section className="tix-motion tix-anim tix-anim--2" aria-label="In motion">
          <h2 className="tix-eyebrow">In motion</h2>
          <div className="tix-motion__list">
            {motion.inMotion.map((conceptItem) => (
              <button
                key={conceptItem.name}
                type="button"
                className={`tix-thread ${conceptItem?.freshness?.stale ? 'is-stale' : ''}`.trim()}
                onClick={() => onSelectConcept(conceptItem.name)}
              >
                <span className="tix-thread__title">{conceptItem.name}</span>
                <span
                  className="tix-thread__note"
                  data-testid={`think-concept-status-${encodeURIComponent(conceptItem.name)}`}
                >
                  {describeMotionNote(conceptItem)}
                </span>
                {String(conceptItem.description || '').trim() ? (
                  <span className="tix-thread__desc">{String(conceptItem.description).trim()}</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
        {motion.shelf.length > 0 && (
          <section className="tix-shelf tix-anim tix-anim--3" aria-label="On the shelf">
            <h2 className="tix-eyebrow">On the shelf</h2>
            <p className="tix-shelf__index">
              {motion.shelf.map((conceptItem, index) => (
                <React.Fragment key={conceptItem.name}>
                  {index > 0 ? <span aria-hidden="true" className="tix-shelf__dot"> · </span> : null}
                  <button
                    type="button"
                    className="tix-shelf__link"
                    onClick={() => onSelectConcept(conceptItem.name)}
                  >
                    {conceptItem.name}
                  </button>
                </React.Fragment>
              ))}
            </p>
          </section>
        )}
        <div className="tix-actions tix-anim tix-anim--4">
          <div className="think-concept-composer-anchor">
            <Button
              variant="secondary"
              onClick={() => onOpenComposer('hero', search)}
              data-testid="think-concepts-index-create-button"
            >
              New concept
            </Button>
            {renderConceptComposer('hero')}
          </div>
          <QuietButton onClick={onOpenTemplatePicker}>
            Use template
          </QuietButton>
        </div>
      </div>
    ) : allConceptsCount === 0 ? (
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
            onClick={() => onOpenComposer('empty', search)}
            data-testid="think-concepts-empty-create-button"
          >
            Create your first concept
          </Button>
          <Link className="think-concepts-empty-state__secondary muted small" to="/how-to-use">
            See the full walkthrough
          </Link>
          {renderConceptComposer('empty')}
        </div>
      </SurfaceCard>
    ) : (
      <SurfaceCard className="think-concepts-empty-state" data-testid="think-concepts-empty-state">
        <SectionHeader title="No concepts match" subtitle="Try a different search term, or clear the filter to see everything." />
        <div className="think-concept-composer-anchor think-concepts-empty-state__actions">
          <Button
            variant="secondary"
            onClick={() => onOpenComposer('empty', search)}
            data-testid="think-concepts-empty-create-button"
          >
            Create concept
          </Button>
          {renderConceptComposer('empty')}
        </div>
      </SurfaceCard>
    )}
  </div>
);

export default ConceptsIndexView;
