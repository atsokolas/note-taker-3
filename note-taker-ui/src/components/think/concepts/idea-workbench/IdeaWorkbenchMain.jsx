import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { Button, QuietButton, SurfaceCard, TagChip } from '../../../../components/ui';
import IdeaWorkbenchCard from './IdeaWorkbenchCard';
import IdeaWorkbenchHypothesisEditor from './IdeaWorkbenchHypothesisEditor';
import IdeaWorkbenchConflictModal from './IdeaWorkbenchConflictModal';

const STAGES = ['Seed', 'Gathering', 'Forming', 'Testing', 'Sharpening'];
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

const IdeaWorkbenchMain = ({
  model,
  utilityActions
}) => {
  const [expandedCardIds, setExpandedCardIds] = useState({});
  const [activeDragId, setActiveDragId] = useState('');
  const [consumingCardIds, setConsumingCardIds] = useState([]);
  const [isHypothesisReceiving, setIsHypothesisReceiving] = useState(false);
  const consumeTimeoutRef = useRef(null);
  const receiveTimeoutRef = useRef(null);

  const cardsByZone = useMemo(() => ({
    workspace: model.state.cards.filter(card => card.zone === 'workspace'),
    supports: model.state.cards.filter(card => card.zone === 'supports'),
    contradictions: model.state.cards.filter(card => card.zone === 'contradictions'),
    questions: model.state.cards.filter(card => card.zone === 'questions')
  }), [model.state.cards]);
  const hypothesisComments = useMemo(
    () => model.state.agent.comments.filter((comment) => comment.target === 'hypothesis'),
    [model.state.agent.comments]
  );
  const pendingSuggestionCount = useMemo(
    () => hypothesisComments.filter((comment) => comment.kind === 'hypothesis-suggestion').length,
    [hypothesisComments]
  );
  const latestHypothesisComment = hypothesisComments[0] || null;
  const secondaryHypothesisComments = hypothesisComments.slice(1, 3);
  const agentStatusLabel = model.agentBusy
    ? model.agentModeLabel || 'Working'
    : model.agentModeLabel || 'Ready';

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

  useEffect(() => () => {
    if (consumeTimeoutRef.current) window.clearTimeout(consumeTimeoutRef.current);
    if (receiveTimeoutRef.current) window.clearTimeout(receiveTimeoutRef.current);
  }, []);

  const handleDropIntoHypothesis = (cardId) => {
    if (!cardId) return;
    setConsumingCardIds((previous) => (
      previous.includes(cardId) ? previous : [...previous, cardId]
    ));
    setIsHypothesisReceiving(true);

    if (receiveTimeoutRef.current) window.clearTimeout(receiveTimeoutRef.current);
    receiveTimeoutRef.current = window.setTimeout(() => {
      setIsHypothesisReceiving(false);
    }, 620);

    if (consumeTimeoutRef.current) window.clearTimeout(consumeTimeoutRef.current);
    consumeTimeoutRef.current = window.setTimeout(() => {
      model.actions.insertCardIntoHypothesis(cardId, { removeCard: true });
      setConsumingCardIds((previous) => previous.filter((entry) => entry !== cardId));
    }, 220);
  };

  return (
    <div className="idea-workbench">
      <SurfaceCard className="idea-workbench-panel idea-workbench-panel--header">
        <div className="idea-workbench-header">
          <div className="idea-workbench-header__copy">
            <div className="idea-workbench-header__eyebrow-row">
              <span className="idea-workbench-header__eyebrow">{model.state.header.label}</span>
              <span className="idea-workbench-header__lede">Workbench</span>
            </div>
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
            <div className="idea-workbench-header__meta-strip">
              <label className="idea-workbench-header__pill idea-workbench-header__pill--stage">
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
              <div className={`idea-workbench-header__pill idea-workbench-header__pill--agent ${model.agentBusy ? 'is-active' : ''}`}>
                <span>Agent</span>
                <strong>{agentStatusLabel}</strong>
              </div>
              <div className="idea-workbench-header__pill">
                <span>Hypothesis</span>
                <strong>{model.hypothesisVersion.label} · {model.currentMaturity}</strong>
              </div>
              <div className="idea-workbench-header__pill">
                <span>Open proposals</span>
                <strong>{pendingSuggestionCount}</strong>
              </div>
            </div>
            {utilityActions.shareSlug && (
              <p className="idea-workbench-header__share-link">
                Public link: {`${window.location.origin}/public/concepts/${utilityActions.shareSlug}`}
              </p>
            )}
          </div>
          <div className="idea-workbench-header__controls">
            <div className="idea-workbench-header__utility-copy">
              <span>Utilities</span>
              <p>Keep secondary actions nearby without competing with the working surface.</p>
            </div>
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
      </SurfaceCard>

      <DndContext
        onDragStart={({ active }) => setActiveDragId(String(active.id))}
        onDragEnd={({ active, over }) => {
          if (active?.id && over?.id) {
            const nextTarget = String(over.id);
            if (nextTarget === 'hypothesis-editor') {
              handleDropIntoHypothesis(String(active.id));
            } else {
              model.actions.moveCard(String(active.id), nextTarget);
            }
          }
          setActiveDragId('');
        }}
        onDragCancel={() => setActiveDragId('')}
      >
        <SurfaceCard className="idea-workbench-panel idea-workbench-panel--hypothesis">
          <div className="idea-workbench-section-header">
            <div>
              <h2>Emerging Hypothesis</h2>
              <p>The main drafting surface. Drop evidence directly into the text so the claim grows from material, not beside it.</p>
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
            isReceivingDrop={isHypothesisReceiving}
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

          {latestHypothesisComment && (
            <div
              className={`idea-workbench-hypothesis__agent-response ${latestHypothesisComment.kind === 'hypothesis-suggestion' ? 'is-proposal' : ''}`.trim()}
            >
              <div className="idea-workbench-hypothesis__agent-response-header">
                <div>
                  <span className="idea-workbench-hypothesis__agent-response-label">Latest agent move</span>
                  <h3>{latestHypothesisComment.title}</h3>
                  {latestHypothesisComment.caption && (
                    <p className="idea-workbench-hypothesis__agent-response-caption">
                      {latestHypothesisComment.caption}
                    </p>
                  )}
                </div>
                <div className="idea-workbench-hypothesis__agent-response-badges">
                  {latestHypothesisComment.kind === 'hypothesis-suggestion' && <TagChip>Proposal</TagChip>}
                  <TagChip>{latestHypothesisComment.tone}</TagChip>
                </div>
              </div>
              {latestHypothesisComment.anchorText && (
                <p className="idea-workbench-comment__anchor">On: “{latestHypothesisComment.anchorText}”</p>
              )}
              <p className="idea-workbench-hypothesis__agent-response-body">{latestHypothesisComment.body}</p>
              {latestHypothesisComment.kind === 'hypothesis-suggestion' && (
                <div className="idea-workbench-comment__actions">
                  <Button type="button" variant="secondary" onClick={() => model.actions.acceptAgentComment(latestHypothesisComment.id)}>
                    Blend into draft
                  </Button>
                  <QuietButton type="button" onClick={() => model.actions.dismissAgentComment(latestHypothesisComment.id)}>
                    Dismiss
                  </QuietButton>
                </div>
              )}
              {secondaryHypothesisComments.length > 0 && (
                <div className="idea-workbench-hypothesis__agent-response-list">
                  {secondaryHypothesisComments.map((comment) => (
                    <div key={comment.id} className="idea-workbench-hypothesis__agent-response-item">
                      <strong>{comment.title}</strong>
                      <span>{comment.body}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {model.hypothesisVersion.summary && (
            <div className="idea-workbench-hypothesis__changes">
              <span>What changed</span>
              <p>{model.hypothesisVersion.summary}</p>
            </div>
          )}

          <div className="idea-workbench-hypothesis__material-shell">
            <div className="idea-workbench-section-header idea-workbench-section-header--nested">
              <div>
                <h3>Material in play</h3>
                <p>Stage evidence here, then drag it into the hypothesis when it deserves to become part of the argument.</p>
              </div>
              <TagChip>{model.counts.workspace} cards</TagChip>
            </div>

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

            <div className="idea-workbench-material-list">
              {cardsByZone.workspace.length === 0 && (
                <div className="idea-workbench-empty-state">
                  <p>No material is staged right now.</p>
                  <span>Pull in saved material or ask the agent to surface more evidence.</span>
                </div>
              )}
              {cardsByZone.workspace.map((card, index) => (
                <IdeaWorkbenchCard
                  key={card.id}
                  card={card}
                  layout="strip"
                  sequence={index}
                  draggable
                  consuming={consumingCardIds.includes(card.id)}
                  expanded={Boolean(expandedCardIds[card.id])}
                  onToggleExpanded={() => toggleExpanded(card.id)}
                  onMove={(zone) => model.actions.moveCard(card.id, zone)}
                  onDelete={() => model.actions.deleteCard(card.id)}
                  onTag={() => model.actions.tagCard(card.id)}
                  showWorkspaceActions
                />
              ))}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard className="idea-workbench-panel idea-workbench-panel--evidence">
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
                {cardsByZone[column.id].map((card, index) => (
                  <IdeaWorkbenchCard
                    key={card.id}
                    card={card}
                    layout="lane"
                    sequence={index}
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
