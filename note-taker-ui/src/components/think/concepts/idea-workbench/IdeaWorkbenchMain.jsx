import React, { useMemo, useState } from 'react';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { Button, QuietButton, SurfaceCard, TagChip } from '../../../../components/ui';
import IdeaWorkbenchCard from './IdeaWorkbenchCard';
import IdeaWorkbenchHypothesisEditor from './IdeaWorkbenchHypothesisEditor';
import IdeaWorkbenchConflictModal from './IdeaWorkbenchConflictModal';

const STAGES = ['Seed', 'Gathering', 'Forming', 'Testing', 'Sharpening'];
const WORKSPACE_TYPES = ['Note', 'Highlight', 'Quote', 'Article snippet', 'Concept', 'Agent suggestion'];
const EVIDENCE_COLUMNS = [
  {
    id: 'supports',
    title: 'Supports',
    description: 'What currently strengthens the claim.'
  },
  {
    id: 'contradictions',
    title: 'Contradictions',
    description: 'What resists or complicates the claim.'
  },
  {
    id: 'questions',
    title: 'Open Questions',
    description: 'What still needs to be answered.'
  }
];

const DroppableColumn = ({
  id,
  title,
  description,
  count,
  children
}) => {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`idea-workbench-column ${isOver ? 'is-over' : ''}`}>
      <div className="idea-workbench-column__header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <TagChip>{count}</TagChip>
      </div>
      <div className="idea-workbench-column__body">
        {children}
      </div>
    </section>
  );
};

const DroppableTextBox = ({ id, className = '', children }) => {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'is-over' : ''}`.trim()}>
      {children}
    </div>
  );
};

const IdeaWorkbenchMain = ({
  model,
  utilityActions
}) => {
  const [expandedCardIds, setExpandedCardIds] = useState({});
  const [activeDragId, setActiveDragId] = useState('');
  const cardsByZone = useMemo(() => ({
    workspace: model.state.cards.filter(card => card.zone === 'workspace'),
    supports: model.state.cards.filter(card => card.zone === 'supports'),
    contradictions: model.state.cards.filter(card => card.zone === 'contradictions'),
    questions: model.state.cards.filter(card => card.zone === 'questions')
  }), [model.state.cards]);
  const activeCard = useMemo(
    () => model.state.cards.find(card => card.id === activeDragId) || null,
    [activeDragId, model.state.cards]
  );

  const toggleExpanded = (cardId) => {
    setExpandedCardIds((previous) => ({
      ...previous,
      [cardId]: !previous[cardId]
    }));
  };

  return (
    <div className="idea-workbench">
      <SurfaceCard className="idea-workbench-panel idea-workbench-panel--header">
        <div className="idea-workbench-header">
          <div className="idea-workbench-header__copy">
            <span className="idea-workbench-header__eyebrow">{model.state.header.label}</span>
            <input
              className="idea-workbench-header__title"
              value={model.state.header.title}
              onChange={(event) => model.actions.setHeaderField('title', event.target.value)}
              aria-label="Idea title"
            />
            <input
              className="idea-workbench-header__prompt"
              value={model.state.header.prompt}
              onChange={(event) => model.actions.setHeaderField('prompt', event.target.value)}
              aria-label="Idea framing prompt"
            />
          </div>
          <div className="idea-workbench-header__controls">
            <label className="idea-workbench-header__stage">
              <span>Stage</span>
              <select
                value={model.state.header.stage}
                onChange={(event) => model.actions.setHeaderField('stage', event.target.value)}
              >
                {STAGES.map((stage) => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </label>
            <div className="idea-workbench-header__utilities">
              {utilityActions.onSynthesize && (
                <QuietButton type="button" onClick={utilityActions.onSynthesize}>Synthesize</QuietButton>
              )}
              {utilityActions.onExport && (
                <QuietButton type="button" onClick={utilityActions.onExport}>Export</QuietButton>
              )}
              {utilityActions.onShare && (
                <QuietButton type="button" onClick={utilityActions.onShare} disabled={utilityActions.shareWorking}>
                  {utilityActions.shareWorking ? 'Saving…' : utilityActions.shareLabel}
                </QuietButton>
              )}
            </div>
          </div>
        </div>
        {utilityActions.shareSlug && (
          <p className="idea-workbench-header__share-link">
            Public link: {`${window.location.origin}/public/concepts/${utilityActions.shareSlug}`}
          </p>
        )}
      </SurfaceCard>

      <DndContext
        onDragStart={({ active }) => setActiveDragId(String(active.id))}
        onDragEnd={({ active, over }) => {
          if (active?.id && over?.id) {
            const nextTarget = String(over.id);
            if (nextTarget === 'workspace-composer') {
              model.actions.insertCardIntoWorkspaceDraft(String(active.id));
            } else if (nextTarget === 'hypothesis-editor') {
              model.actions.insertCardIntoHypothesis(String(active.id));
            } else {
              model.actions.moveCard(String(active.id), nextTarget);
            }
          }
          setActiveDragId('');
        }}
        onDragCancel={() => setActiveDragId('')}
      >
        <SurfaceCard className="idea-workbench-panel">
          <div className="idea-workbench-section-header">
            <div>
              <h2>Open workspace</h2>
              <p>Gather raw material into a flexible space, then sort it when the shape starts to appear.</p>
            </div>
            <div className="idea-workbench-section-header__counts">
              <TagChip>{model.counts.workspace} cards</TagChip>
            </div>
          </div>

          <DroppableTextBox id="workspace-composer" className="idea-workbench-composer">
            <textarea
              value={model.state.workspaceDraft}
              onChange={(event) => model.actions.setWorkspaceDraft(event.target.value)}
              placeholder="Type a note, paste a quote, drop in a highlight, or capture a hunch."
              rows={4}
            />
            <div className="idea-workbench-composer__controls">
              <div className="idea-workbench-composer__types">
                {WORKSPACE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={model.state.workspaceDraftType === type ? 'is-active' : ''}
                    onClick={() => model.actions.setWorkspaceDraftType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <Button type="button" variant="secondary" onClick={model.actions.addWorkspaceCard}>
                Add to workspace
              </Button>
            </div>
          </DroppableTextBox>

          <div className="idea-workbench-imports">
            <QuietButton type="button" onClick={() => model.actions.importMaterialCard('highlight')}>
              Pull highlights {model.importableCounts.highlights > 0 ? `(${model.importableCounts.highlights})` : ''}
            </QuietButton>
            <QuietButton type="button" onClick={() => model.actions.importMaterialCard('note')}>
              Pull notes {model.importableCounts.notes > 0 ? `(${model.importableCounts.notes})` : ''}
            </QuietButton>
            <QuietButton type="button" onClick={() => model.actions.importMaterialCard('snippet')}>
              Pull snippets {model.importableCounts.snippets > 0 ? `(${model.importableCounts.snippets})` : ''}
            </QuietButton>
            <QuietButton type="button" onClick={() => model.actions.importMaterialCard('concept')}>
              Pull concepts {model.importableCounts.concepts > 0 ? `(${model.importableCounts.concepts})` : ''}
            </QuietButton>
          </div>

          <div className="idea-workbench-workspace-grid">
            {cardsByZone.workspace.length === 0 && (
              <div className="idea-workbench-empty-state">
                <p>No cards in the workspace yet.</p>
                <span>Start by adding a note above or pulling in saved material.</span>
              </div>
            )}
            {cardsByZone.workspace.map((card) => (
              <IdeaWorkbenchCard
                key={card.id}
                card={card}
                draggable
                expanded={Boolean(expandedCardIds[card.id])}
                onToggleExpanded={() => toggleExpanded(card.id)}
                onMove={(zone) => model.actions.moveCard(card.id, zone)}
                onDelete={() => model.actions.deleteCard(card.id)}
                onTag={() => model.actions.tagCard(card.id)}
                showWorkspaceActions
              />
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="idea-workbench-panel">
          <div className="idea-workbench-section-header">
            <div>
              <h2>Evidence classification</h2>
              <p>Use support, tension, and open questions as live reasoning structures rather than dead buckets.</p>
            </div>
          </div>

          <div className="idea-workbench-columns">
            {EVIDENCE_COLUMNS.map((column) => (
              <DroppableColumn
                key={column.id}
                id={column.id}
                title={column.title}
                description={column.description}
                count={model.counts[column.id]}
              >
                {cardsByZone[column.id].length === 0 && (
                  <div className="idea-workbench-column__empty">
                    Drag cards here or use the quick actions.
                  </div>
                )}
                {cardsByZone[column.id].map((card) => (
                  <IdeaWorkbenchCard
                    key={card.id}
                    card={card}
                    compact
                    draggable
                    expanded={Boolean(expandedCardIds[card.id])}
                    onToggleExpanded={() => toggleExpanded(card.id)}
                    onMove={(zone) => model.actions.moveCard(card.id, zone)}
                    onDelete={() => model.actions.deleteCard(card.id)}
                    onTag={() => model.actions.tagCard(card.id)}
                  />
                ))}
              </DroppableColumn>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="idea-workbench-panel idea-workbench-panel--hypothesis">
          <div className="idea-workbench-section-header">
            <div>
              <h2>Emerging Hypothesis</h2>
              <p>A living draft shaped by the current evidence and by the agent’s pressure-testing.</p>
            </div>
            <div className="idea-workbench-hypothesis__meta">
              <TagChip>{model.hypothesisVersion.label}</TagChip>
              <TagChip>{model.currentMaturity}</TagChip>
            </div>
          </div>

          <IdeaWorkbenchHypothesisEditor
            value={model.state.hypothesis.html}
            onChange={model.actions.updateHypothesisHtml}
            droppableId="hypothesis-editor"
          />

          <div className="idea-workbench-hypothesis__actions">
            <Button type="button" variant="secondary" onClick={() => model.actions.runQuickAction('challenge-hypothesis')}>
              Ask agent to challenge this
            </Button>
            <Button type="button" variant="secondary" onClick={() => model.actions.runQuickAction('strengthen-hypothesis')}>
              Strengthen this
            </Button>
            <Button type="button" variant="secondary" onClick={() => model.actions.runQuickAction('find-supports')}>
              Find supporting evidence
            </Button>
            <Button type="button" variant="secondary" onClick={() => model.actions.runQuickAction('find-contradictions')}>
              Find contradictions
            </Button>
            <Button type="button" variant="secondary" onClick={() => model.actions.runQuickAction('rewrite-clearly')}>
              Rewrite more clearly
            </Button>
            <QuietButton type="button" onClick={() => model.actions.snapshotHypothesis()}>
              Save version
            </QuietButton>
          </div>

          {model.hypothesisVersion.summary && (
            <div className="idea-workbench-hypothesis__changes">
              <span>What changed</span>
              <p>{model.hypothesisVersion.summary}</p>
            </div>
          )}

          <div className="idea-workbench-hypothesis__comments">
            {model.state.agent.comments
              .filter(comment => comment.target === 'hypothesis')
              .slice(0, 3)
              .map((comment) => (
                <div key={comment.id} className={`idea-workbench-comment idea-workbench-comment--${comment.tone}`}>
                  <h4>{comment.title}</h4>
                  {comment.anchorText && <p className="idea-workbench-comment__anchor">On: “{comment.anchorText}”</p>}
                  <p>{comment.body}</p>
                </div>
              ))}
          </div>
        </SurfaceCard>

        <DragOverlay>
          {activeCard ? (
            <div className="idea-workbench-card-overlay">
              <IdeaWorkbenchCard
                card={activeCard}
                compact={activeCard.zone !== 'workspace'}
                onToggleExpanded={() => {}}
                onMove={() => {}}
                onDelete={() => {}}
                onTag={() => {}}
                showWorkspaceActions={activeCard.zone === 'workspace'}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <IdeaWorkbenchConflictModal model={model} />
    </div>
  );
};

export default IdeaWorkbenchMain;
