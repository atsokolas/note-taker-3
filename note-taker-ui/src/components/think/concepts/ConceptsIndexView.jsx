import React from 'react';
import { Link } from 'react-router-dom';
import { Button, QuietButton } from '../../ui';
import CalmIndexView, { ConceptIndexEmptyState } from '../CalmIndexView';
import { describeConceptMotionNote } from '../calmIndexModel';

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
  renderConceptComposer
}) => (
  <CalmIndexView
    eyebrow="Think · Concepts"
    orientation={orientation}
    motion={motion}
    loading={conceptsLoading}
    error={conceptsError}
    describeMotionNote={(thread) => describeConceptMotionNote(thread?.raw || thread)}
    onSelectThread={(thread) => onSelectConcept(thread.id)}
    motionStatusTestIdPrefix="think-concept-status"
    emptyState={(
      <ConceptIndexEmptyState
        allCount={allConceptsCount}
        search={search}
        onOpenComposer={onOpenComposer}
        onOpenTemplatePicker={onOpenTemplatePicker}
        renderConceptComposer={renderConceptComposer}
        walkthroughLink={allConceptsCount === 0 ? (
          <Link className="think-concepts-empty-state__secondary muted small" to="/how-to-use">
            See the full walkthrough
          </Link>
        ) : null}
      />
    )}
    actions={filteredConcepts.length > 0 ? (
      <>
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
      </>
    ) : null}
  />
);

export default ConceptsIndexView;
