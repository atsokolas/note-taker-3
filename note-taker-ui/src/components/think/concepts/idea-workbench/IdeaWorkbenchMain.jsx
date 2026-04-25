import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { Button, QuietButton, TagChip } from '../../../../components/ui';
import IdeaWorkbenchCard from './IdeaWorkbenchCard';
import IdeaWorkbenchHypothesisEditor from './IdeaWorkbenchHypothesisEditor';
import IdeaWorkbenchConflictModal from './IdeaWorkbenchConflictModal';

const STAGES = ['Seed', 'Gathering', 'Forming', 'Testing', 'Sharpening'];
const PRIMARY_ACTIONS = [
  { id: 'strengthen-hypothesis', label: 'Strengthen claim' },
  { id: 'find-supports', label: 'Pull supports' },
  { id: 'find-contradictions', label: 'Surface tension' },
  { id: 'rewrite-clearly', label: 'Clarify wording' }
];

const EVIDENCE_COLUMNS = [
  {
    id: 'supports',
    title: 'Support',
    description: 'The material now carrying the claim.'
  },
  {
    id: 'contradictions',
    title: 'Tension',
    description: 'The pressure still resisting the draft.'
  },
  {
    id: 'questions',
    title: 'Open questions',
    description: 'What still needs to be answered.'
  }
];

const stripHtml = (value = '') => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const shorten = (value = '', wordLimit = 18) => {
  const words = stripHtml(value).split(' ').filter(Boolean);
  if (words.length <= wordLimit) return words.join(' ');
  return `${words.slice(0, wordLimit).join(' ')}…`;
};

const formatCount = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

const DroppableColumn = ({
  id,
  title,
  description,
  count,
  children
}) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      className={`idea-workbench-column ${isOver ? 'is-over' : ''}`}
      data-testid={`workbench-column-${id}`}
    >
      <div className="idea-workbench-column__header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <TagChip>{count}</TagChip>
      </div>
      <div className="idea-workbench-column__body">
        {children}
        {isOver && (
          <div className="idea-workbench-column__drop-hint" aria-hidden="true">
            Drop to {String(title || '').toLowerCase()}
          </div>
        )}
      </div>
    </section>
  );
};

const IdeaWorkbenchMain = ({
  model,
  utilityActions
}) => {
  const [showWorkbenchDeck, setShowWorkbenchDeck] = useState(false);
  const [expandedCardIds, setExpandedCardIds] = useState({});
  const [activeDragId, setActiveDragId] = useState('');
  const [consumingCardIds, setConsumingCardIds] = useState([]);
  const [isHypothesisReceiving, setIsHypothesisReceiving] = useState(false);
  const consumeTimeoutRef = useRef(null);
  const receiveTimeoutRef = useRef(null);

  const cardsByZone = useMemo(() => ({
    workspace: model.state.cards.filter((card) => card.zone === 'workspace'),
    supports: model.state.cards.filter((card) => card.zone === 'supports'),
    contradictions: model.state.cards.filter((card) => card.zone === 'contradictions'),
    questions: model.state.cards.filter((card) => card.zone === 'questions')
  }), [model.state.cards]);

  const hypothesisComments = useMemo(
    () => model.state.agent.comments.filter((comment) => comment.target === 'hypothesis'),
    [model.state.agent.comments]
  );
  const latestHypothesisComment = hypothesisComments[0] || null;
  const featuredSupport = cardsByZone.supports[0] || cardsByZone.workspace[0] || null;
  const featuredTension = cardsByZone.contradictions[0] || null;
  const featuredQuestion = cardsByZone.questions[0] || null;

  const agentStatusLabel = model.agentBusy
    ? model.agentModeLabel || 'Working'
    : model.agentModeLabel || 'Ready';
  const hypothesisPlainText = useMemo(
    () => stripHtml(model.state.hypothesis.html),
    [model.state.hypothesis.html]
  );
  const hypothesisWordCount = useMemo(
    () => hypothesisPlainText.split(' ').filter(Boolean).length,
    [hypothesisPlainText]
  );
  const workingClaim = shorten(hypothesisPlainText || model.state.header.prompt || model.state.header.title, 34);

  const activeCard = useMemo(
    () => model.state.cards.find((card) => card.id === activeDragId) || null,
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
      <header className="idea-workbench-head">
        <div className="idea-workbench-head__identity">
          <div className="idea-workbench-head__path">
            <span>Evolutionary path — draft {String(model.serverRevision || 4).padStart(2, '0')}</span>
            <div className="idea-workbench-head__path-rule" aria-hidden="true" />
          </div>
          <span className="idea-workbench-head__eyebrow">{model.state.header.label}</span>
          <input
            className="idea-workbench-head__title"
            value={model.state.header.title}
            onChange={(event) => model.actions.setHeaderField('title', event.target.value)}
            aria-label="Idea title"
          />
          <div className="idea-workbench-head__prompt-block">
            <span className="idea-workbench-head__prompt-label">Framing question</span>
            <input
              className="idea-workbench-head__prompt"
              value={model.state.header.prompt}
              onChange={(event) => model.actions.setHeaderField('prompt', event.target.value)}
              aria-label="Idea framing prompt"
            />
          </div>
          <div className="idea-workbench-head__meta-inline">
            <label className="idea-workbench-head__meta-inline-item idea-workbench-head__meta-inline-item--select">
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
            <span className="idea-workbench-head__meta-inline-item"><strong>{agentStatusLabel}</strong></span>
            <span className="idea-workbench-head__meta-inline-item"><strong>{model.hypothesisVersion.label}</strong></span>
            <span className="idea-workbench-head__meta-inline-item"><strong>{model.currentMaturity}</strong></span>
          </div>

          <div className="idea-workbench-head__utilities">
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

          {utilityActions.shareSlug && (
            <p className="idea-workbench-head__share-link">
              {`${window.location.origin}/public/concepts/${utilityActions.shareSlug}`}
            </p>
          )}
        </div>
      </header>

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
        <div className="idea-workbench-canvas">
          <section className="idea-workbench-sheet">
            <div className="idea-workbench-claim">
              <span className="idea-workbench-claim__eyebrow">Working claim</span>
              <blockquote>{workingClaim || 'The claim will sharpen as evidence enters the draft.'}</blockquote>
              <div className="idea-workbench-claim__meta">
                <span>Confidence 0.89</span>
                <div className="idea-workbench-claim__marks" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span className="is-muted" />
                </div>
              </div>
            </div>

            <div className="idea-workbench-sheet__header">
              <div>
                <span className="idea-workbench-sheet__eyebrow">Draft</span>
                <h2>Current argument</h2>
                <p>{hypothesisWordCount > 0 ? `${formatCount(hypothesisWordCount, 'word')} in the working draft.` : 'No argument drafted yet.'}</p>
              </div>
              <div className="idea-workbench-sheet__meta">
                <TagChip>{model.hypothesisVersion.label}</TagChip>
                <TagChip>{model.currentMaturity}</TagChip>
                <TagChip>{formatCount(model.counts.workspace, 'card')}</TagChip>
              </div>
            </div>

            <IdeaWorkbenchHypothesisEditor
              value={model.state.hypothesis.html}
              onChange={model.actions.updateHypothesisHtml}
              droppableId="hypothesis-editor"
              isReceivingDrop={isHypothesisReceiving}
            />

            <div className="idea-workbench-sheet__actions">
              {PRIMARY_ACTIONS.map((action) => (
                <Button
                  key={action.id}
                  type="button"
                  variant="secondary"
                  onClick={() => model.actions.runQuickAction(action.id)}
                >
                  {action.label}
                </Button>
              ))}
              <QuietButton type="button" onClick={() => model.actions.runQuickAction('challenge-hypothesis')}>
                Challenge
              </QuietButton>
              <QuietButton type="button" onClick={() => model.actions.snapshotHypothesis()}>
                Save version
              </QuietButton>
            </div>

            {latestHypothesisComment?.kind === 'hypothesis-suggestion' && (
              <div className="idea-workbench-sheet__proposal">
                <span className="idea-workbench-sheet__proposal-label">Suggested revision</span>
                <p>{latestHypothesisComment.body}</p>
                <div className="idea-workbench-sheet__proposal-actions">
                  <Button type="button" variant="secondary" onClick={() => model.actions.acceptAgentComment(latestHypothesisComment.id)}>
                    Blend into draft
                  </Button>
                  <QuietButton type="button" onClick={() => model.actions.dismissAgentComment(latestHypothesisComment.id)}>
                    Dismiss
                  </QuietButton>
                </div>
              </div>
            )}
          </section>

          <aside className="idea-workbench-stream">
            <div className="idea-workbench-stream__header">
              <span className="idea-workbench-stream__eyebrow">Evidence stream</span>
              <span className="idea-workbench-stream__kicker">Parallel contextualization</span>
            </div>

            {featuredSupport ? (
              <article className="idea-workbench-stream__card is-support">
                <div className="idea-workbench-stream__card-meta">
                  <span>{featuredSupport.source || featuredSupport.type}</span>
                  <span>{featuredSupport.type}</span>
                </div>
                <h3>{featuredSupport.title}</h3>
                <p className="idea-workbench-stream__quote">{shorten(featuredSupport.content, 28)}</p>
                {(featuredSupport.tags || []).length > 0 && (
                  <div className="idea-workbench-stream__tags">
                    {featuredSupport.tags.slice(0, 3).map((tag) => (
                      <span key={`${featuredSupport.id}-${tag}`}>{tag}</span>
                    ))}
                  </div>
                )}
              </article>
            ) : (
              <article className="idea-workbench-stream__card is-empty">
                <div className="idea-workbench-stream__card-meta">
                  <span>Evidence stream</span>
                </div>
                <p className="idea-workbench-stream__quote">
                  Pull one useful source into support so the claim is grounded in something concrete.
                </p>
              </article>
            )}

            {featuredTension && (
              <article className="idea-workbench-stream__note is-tension">
                <span className="idea-workbench-stream__note-label">Active tension</span>
                <p>{shorten(featuredTension.content, 26)}</p>
              </article>
            )}

            {featuredQuestion && (
              <article className="idea-workbench-stream__note">
                <span className="idea-workbench-stream__note-label">Unresolved question</span>
                <p>{shorten(featuredQuestion.content, 24)}</p>
              </article>
            )}

            {latestHypothesisComment?.kind === 'hypothesis-suggestion' && (
              <article className="idea-workbench-stream__note is-synthesis">
                <span className="idea-workbench-stream__note-label">AI synthesis node</span>
                <p>{shorten(latestHypothesisComment.body, 34)}</p>
              </article>
            )}
          </aside>
        </div>

        <div className="idea-workbench-deck-toggle">
          <QuietButton
            type="button"
            onClick={() => setShowWorkbenchDeck((previous) => !previous)}
          >
            {showWorkbenchDeck ? 'Hide material lanes' : `Open material lanes (${model.counts.workspace + model.counts.supports + model.counts.contradictions + model.counts.questions})`}
          </QuietButton>
        </div>

        {showWorkbenchDeck && (
        <div className="idea-workbench-deck">
          <section className="idea-workbench-material">
            <div className="idea-workbench-section-header">
              <div>
                <span className="idea-workbench-section-header__kicker">Material</span>
                <h2>Material in play</h2>
                <p>Stage evidence here, then drag it into the sentence it changes.</p>
              </div>
              <TagChip>{model.counts.workspace}</TagChip>
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
                  <p>No staged material.</p>
                  <span>Pull in notes, highlights, or snippets and sort only what sharpens the argument.</span>
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
          </section>

          <section className="idea-workbench-lanes">
            <div className="idea-workbench-section-header">
              <div>
                <span className="idea-workbench-section-header__kicker">Lanes</span>
                <h2>Reasoning lanes</h2>
                <p>Support, tension, and open questions stay live beside the draft.</p>
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
          </section>
        </div>
        )}

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
