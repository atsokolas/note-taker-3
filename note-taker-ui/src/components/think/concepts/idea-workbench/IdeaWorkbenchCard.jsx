import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { QuietButton, TagChip } from '../../../../components/ui';

const TYPE_CLASS = {
  Note: 'note',
  Highlight: 'highlight',
  Quote: 'quote',
  'Article snippet': 'article-snippet',
  Concept: 'concept',
  'Agent suggestion': 'agent-suggestion',
  'Open question': 'open-question'
};

const zoneActionLabel = (zone) => {
  if (zone === 'supports') return 'Support';
  if (zone === 'contradictions') return 'Tension';
  if (zone === 'questions') return 'Question';
  return 'Workspace';
};

const IdeaWorkbenchCard = ({
  card,
  layout = 'card',
  sequence = 0,
  compact = false,
  draggable = false,
  consuming = false,
  expanded = false,
  onToggleExpanded,
  onMove,
  onDelete,
  onTag,
  showWorkspaceActions = false
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: card.id,
    disabled: !draggable
  });

  return (
    <article
      ref={setNodeRef}
      className={`idea-workbench-card idea-workbench-card--${TYPE_CLASS[card.type] || 'generic'} idea-workbench-card--zone-${card.zone || 'workspace'} ${layout === 'strip' ? 'is-strip' : ''} ${layout === 'lane' ? 'is-lane' : ''} ${compact ? 'is-compact' : ''} ${isDragging ? 'is-dragging' : ''} ${consuming ? 'is-consuming' : ''}`}
      style={{
        ...(transform ? { transform: CSS.Translate.toString(transform) } : {}),
        '--strip-index': sequence
      }}
    >
      <div className="idea-workbench-card__header">
        <div className="idea-workbench-card__meta">
          <span className="idea-workbench-card__type">{card.type}</span>
          {card.origin === 'agent' && <span className="idea-workbench-card__origin">Agent</span>}
          {card.createdAt && <span className="idea-workbench-card__date">{new Date(card.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
        </div>
        {draggable && (
          <button
            type="button"
            className="idea-workbench-card__drag-handle"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${card.title}`}
          >
            Drag
          </button>
        )}
      </div>

      <div className="idea-workbench-card__body">
        <h4>{card.title}</h4>
        {card.source && <span className="idea-workbench-card__source">{card.source}</span>}
        <p>{compact ? card.content : card.content}</p>
      </div>

      {card.tags?.length > 0 && (
        <div className="idea-workbench-card__tags">
          {card.tags.map((tag) => (
            <TagChip key={`${card.id}-${tag}`}>{tag}</TagChip>
          ))}
        </div>
      )}

      <div className="idea-workbench-card__footer">
        <div className="idea-workbench-card__actions idea-workbench-card__actions--primary">
          {showWorkspaceActions ? (
            <>
              <QuietButton type="button" onClick={() => onMove('supports')}>
                Support
              </QuietButton>
              <QuietButton type="button" onClick={() => onMove('contradictions')}>
                Tension
              </QuietButton>
              <QuietButton type="button" onClick={() => onMove('questions')}>
                Question
              </QuietButton>
            </>
          ) : card.zone !== 'workspace' ? (
            <QuietButton type="button" onClick={() => onMove('workspace')}>
              Send back
            </QuietButton>
          ) : null}
        </div>
        <div className="idea-workbench-card__actions idea-workbench-card__actions--secondary">
          {card.sourcePath ? (
            <a className="idea-workbench-card__link" href={card.sourcePath}>
              Open
            </a>
          ) : (
            <QuietButton type="button" onClick={onToggleExpanded}>
              Open
            </QuietButton>
          )}
          <QuietButton type="button" onClick={onTag}>Tag</QuietButton>
          <QuietButton type="button" onClick={onDelete}>Remove</QuietButton>
        </div>
      </div>

      {expanded && (
        <div className="idea-workbench-card__expanded">
          <dl>
            <div>
              <dt>Source</dt>
              <dd>{card.source || 'Workbench'}</dd>
            </div>
            <div>
              <dt>Why it matters</dt>
              <dd>{card.whyItMatters || `Placed in ${zoneActionLabel(card.zone)}.`}</dd>
            </div>
            <div>
              <dt>Strength</dt>
              <dd>{card.strength || 'Undetermined'}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{card.confidence || 'Working'}</dd>
            </div>
            {card.agentAnnotation && (
              <div>
                <dt>Agent annotation</dt>
                <dd>{card.agentAnnotation}</dd>
              </div>
            )}
            {card.relatedHypothesisLabel && (
              <div>
                <dt>Hypothesis link</dt>
                <dd>{card.relatedHypothesisLabel}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </article>
  );
};

export default IdeaWorkbenchCard;
