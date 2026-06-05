import React, { useMemo, useState, useEffect, useCallback } from 'react';
import IdeaWorkbenchHypothesisEditor from './idea-workbench/IdeaWorkbenchHypothesisEditor';
import { createArtifactSlashItems } from '../editor/editorArtifacts';
import { sanitizeAgentReplyText } from './idea-workbench/useIdeaWorkbenchModel';
import { CONCEPT_ACTIONS } from './idea-workbench/conceptActionDispatch';
import { CONCEPT_NOTEBOOK_DRAFT_TEMPLATES } from '../../../utils/conceptNotebookDraft';
import { formatEditorialEvidenceHtml } from './formatEditorialEvidenceHtml';
import { AGENT_DISPLAY_NAME } from '../../../constants/agentIdentity';
import AgentTicker from '../../agent/AgentTicker';

const clean = (value) => String(value || '').trim();
const truncate = (value = '', limit = 220) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};
const stripHtml = (value = '') => clean(String(value || '').replace(/<[^>]+>/g, ' '));
const formatStreamMessage = (message) => {
  const role = clean(message?.role);
  const text = role === 'user'
    ? clean(message?.text)
    : sanitizeAgentReplyText(message?.text);
  return text
    .replace(/^You are currently in concept:[\s\S]*?Context summary:\s*/i, '')
    .replace(/^You asked:\s*["']?[\s\S]*?["']?\s*(?=Found|I found|I can|A few|Nothing|The|One|Pulled|Kept|Done)/i, '')
    .replace(/^Context summary:\s*/i, '')
    .replace(/^How [^.?!]+\s+(?=I found|Found|Pulled)/i, '')
    .replace(/^Found one relevant piece\.\s*/i, 'Found one good lead. ')
    .replace(/^Found (\d+) relevant pieces\.\s*/i, (_match, count) => `Found ${count} good leads. `)
    .replace(/^I found 1 related item in your library\.\s*/i, 'Found one good lead. ')
    .replace(/^I found (\d+) related items in your library\.\s*/i, (_match, count) => `Found ${count} good leads. `)
    .replace(/^Pulled in (\d+) promising pieces\.\s*/i, (_match, count) => `Pulled in ${count} strong leads. `)
    .replace(/If you want, I can now restructure these into inbox\/working\/draft buckets\.?/i, 'Want me to sort them into support, tension, and open questions?')
    .replace(/^Found one clean hit:\s*/i, 'One good lead popped out: ')
    .replace(/^Kept going from the last move\.\s*/i, 'Kept going. ')
    .replace(/^Done\.\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const PARTNER_SECTIONS = [
  { key: 'assistant', label: 'Tension', short: 'Te' },
  { key: 'sources', label: 'Sources', short: 'So' },
  { key: 'highlights', label: 'Highlights', short: 'Hi' },
  { key: 'annotations', label: 'Notes', short: 'No' }
];

const cardExcerpt = (card, limit = 220) => truncate(card?.content || card?.title || '', limit);
const isAgentCard = (card) => clean(card?.origin).toLowerCase() === 'agent';
const zoneLabel = (zone = '') => {
  const safe = clean(zone).toLowerCase();
  if (safe === 'supports') return 'Support';
  if (safe === 'contradictions') return 'Tension';
  if (safe === 'questions') return 'Open question';
  return 'Related source';
};
const getDraftTargetLabel = (draft = {}) => {
  const safe = clean(draft?.kind).toLowerCase();
  if (safe === 'support') return 'Concept support';
  if (safe === 'contradiction') return 'Visible tension';
  if (safe === 'question') return 'Open pressure';
  if (safe === 'refresh') return 'Fresh material';
  return 'Concept margin';
};
const getDraftApplyLabel = (draft = {}) => {
  const safe = clean(draft?.kind).toLowerCase();
  if (safe === 'support') return 'Add support';
  if (safe === 'contradiction') return 'Stage tension';
  if (safe === 'question') return 'Keep question open';
  if (safe === 'refresh') return 'Review fresh material';
  return 'Attach sources';
};

const DraggableEvidenceCard = ({ card, onIntegrate }) => {
  const handleDragStart = (event) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-noeis-card-id', String(card.id));
    event.dataTransfer.setData('application/x-noeis-card-json', JSON.stringify(card));
    event.dataTransfer.setData('text/plain', String(card.id));
  };

  return (
    <article
      className="concept-editorial-evidence__item"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="concept-editorial-evidence__item-meta">
        <span>{clean(card.type) || 'Evidence'}</span>
        <span
          className="concept-editorial-evidence__item-grip"
          role="img"
          aria-label="Drag this evidence into the draft"
          title="Drag into the draft"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </span>
      </div>
      <h4>{card.title || 'Untitled evidence'}</h4>
      <p>{cardExcerpt(card, 160)}</p>
      <div className="concept-editorial-evidence__item-footer">
        <span>{clean(card.source) || 'Workbench source'}</span>
        <button type="button" onClick={() => onIntegrate(card)}>Integrate</button>
      </div>
    </article>
  );
};

const isHighlightCard = (card) => clean(card?.type).toLowerCase().includes('highlight');
const isSourceCard = (card) => ['article', 'note', 'concept', 'snippet'].some(
  (token) => clean(card?.type).toLowerCase().includes(token)
);

export const ConceptPartnerRail = ({
  concept,
  concepts = [],
  selectedConceptName = '',
  model,
  activeSection = 'assistant',
  onChangeSection,
  onOpenConcept,
  collapsed = false,
  onToggleCollapse
}) => {
  const [hoveredSection, setHoveredSection] = useState(null);
  const contradictions = useMemo(
    () => model.state.cards.filter((card) => card.zone === 'contradictions').slice(0, 3),
    [model.state.cards]
  );
  const questions = useMemo(
    () => model.state.cards.filter((card) => card.zone === 'questions').slice(0, 3),
    [model.state.cards]
  );
  const highlights = useMemo(
    () => model.state.cards.filter(isHighlightCard).slice(0, 4),
    [model.state.cards]
  );
  const sources = useMemo(
    () => model.state.cards.filter(isSourceCard).slice(0, 4),
    [model.state.cards]
  );
  const annotations = useMemo(() => {
    const commentItems = model.state.agent.comments
      .filter((comment) => clean(comment?.body))
      .slice(0, 3)
      .map((comment) => ({
        id: `comment-${comment.id}`,
        body: comment.body
      }));
    if (commentItems.length > 0) return commentItems;
    return model.state.cards
      .filter((card) => clean(card?.whyItMatters) || clean(card?.agentAnnotation))
      .slice(0, 3)
      .map((card) => ({
        id: `card-${card.id}`,
        body: clean(card.agentAnnotation) || clean(card.whyItMatters)
      }));
  }, [model.state.agent.comments, model.state.cards]);
  const workingConcepts = useMemo(
    () => concepts
      .filter((item) => clean(item?.name) && clean(item.name) !== clean(selectedConceptName))
      .slice(0, 8),
    [concepts, selectedConceptName]
  );
  const conceptChoices = useMemo(
    () => [concept, ...workingConcepts]
      .filter(Boolean)
      .map((item) => ({
        id: clean(item?.name),
        name: clean(item?.name),
        count: Number.isFinite(item?.count) ? item.count : null,
        isCurrent: clean(item?.name) === clean(selectedConceptName)
      }))
      .filter((item) => item.name),
    [concept, selectedConceptName, workingConcepts]
  );

  const sectionMap = {
    assistant: {
      label: 'Tensions in play',
      items: contradictions.map((card) => ({ id: card.id, body: truncate(card.title || card.content, 110) })),
      empty: `No contradiction staged yet for ${concept?.name || 'this concept'}.`,
      secondaryLabel: 'Unresolved questions',
      secondaryItems: questions.map((card) => ({ id: card.id, body: truncate(card.title || card.content, 110) })),
      secondaryEmpty: 'No open question has been promoted yet.'
    },
    sources: {
      label: 'Sources in play',
      items: sources.map((card) => ({ id: card.id, body: truncate(card.source || card.title, 110) })),
      empty: 'No source cards are staged yet.',
      secondaryLabel: 'Working concepts',
      secondaryItems: workingConcepts.map((item) => ({ id: item.name, body: item.name, isConcept: true })),
      secondaryEmpty: 'No other concepts available yet.'
    },
    highlights: {
      label: 'Recent highlights',
      items: highlights.map((card) => ({ id: card.id, body: truncate(card.content || card.title, 110) })),
      empty: 'No highlight cards are staged yet.',
      secondaryLabel: 'Working concepts',
      secondaryItems: workingConcepts.map((item) => ({ id: item.name, body: item.name, isConcept: true })),
      secondaryEmpty: 'No other concepts available yet.'
    },
    annotations: {
      label: 'Agent annotations',
      items: annotations,
      empty: 'No annotations are available yet.',
      secondaryLabel: 'Working concepts',
      secondaryItems: workingConcepts.map((item) => ({ id: item.name, body: item.name, isConcept: true })),
      secondaryEmpty: 'No other concepts available yet.'
    }
  };
  const sectionContent = sectionMap[activeSection] || sectionMap.assistant;
  const activeSectionIndex = Math.max(0, PARTNER_SECTIONS.findIndex((section) => section.key === activeSection));
  const indicatorIndex = hoveredSection == null
    ? activeSectionIndex
    : Math.max(0, PARTNER_SECTIONS.findIndex((section) => section.key === hoveredSection));

  const renderSectionList = (items, emptyMessage) => (
    items.length > 0 ? (
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.isConcept && onOpenConcept ? (
              <button type="button" className="concept-editorial-partner__concept-link" onClick={() => onOpenConcept(item.body)}>
                {item.body}
              </button>
            ) : (
              item.body
            )}
          </li>
        ))}
      </ul>
    ) : (
      <p>{emptyMessage}</p>
    )
  );

  return (
    <div className="concept-editorial-partner">
      <div className="concept-editorial-partner__hero">
        <div className="concept-editorial-partner__title-row">
          <div className="concept-editorial-partner__mark">•</div>
          <div>
            <h2>Concept map</h2>
            <p>Quiet context</p>
          </div>
        </div>
        <p className="concept-editorial-partner__note">
          Keep the draft central. Use this margin to track pressure, source memory, and neighboring ideas.
        </p>
        <button
          type="button"
          className="concept-editorial-partner__collapse-toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand partner rail' : 'Collapse partner rail'}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      <nav
        className="concept-editorial-partner__nav"
        aria-label="Concept partner sections"
        onMouseLeave={() => setHoveredSection(null)}
      >
        <span
          className="concept-editorial-partner__nav-indicator"
          aria-hidden="true"
          style={{ transform: `translateY(${indicatorIndex * 39}px)` }}
        />
        {PARTNER_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={activeSection === section.key ? 'is-active' : ''}
            onClick={() => onChangeSection?.(section.key)}
            onMouseEnter={() => setHoveredSection(section.key)}
            title={collapsed ? section.label : undefined}
          >
            <span className="concept-editorial-partner__nav-short">{section.short}</span>
            <span className="concept-editorial-partner__nav-label">{section.label}</span>
          </button>
        ))}
      </nav>

      <div className="concept-editorial-partner__sections">
        <section className="concept-editorial-partner__section">
          <span>Working concepts</span>
          {conceptChoices.length > 0 ? (
            <ul>
              {conceptChoices.map((item) => (
                <li key={item.id}>
                  {item.isCurrent ? (
                    <span className="concept-editorial-partner__concept-link is-current">
                      {item.name}{item.count !== null ? ` · ${item.count}` : ''}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="concept-editorial-partner__concept-link"
                      onClick={() => onOpenConcept?.(item.name)}
                    >
                      {item.name}{item.count !== null ? ` · ${item.count}` : ''}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No other concepts available yet.</p>
          )}
        </section>

        <section className="concept-editorial-partner__section">
          <span>{sectionContent.label}</span>
          {renderSectionList(sectionContent.items, sectionContent.empty)}
        </section>

        <section className="concept-editorial-partner__section">
          <span>{sectionContent.secondaryLabel}</span>
          {renderSectionList(sectionContent.secondaryItems, sectionContent.secondaryEmpty)}
        </section>
      </div>

    </div>
  );
};

const ConceptEvidenceStreamView = ({
  concept,
  model,
  onEditorReady,
  onDropCard,
  isReceivingDrop = false,
  onRunAction,
  onOpenTemplatePicker,
  onShareConcept
}) => {
  const supportCards = useMemo(
    () => model.state.cards.filter((card) => card.zone === 'supports'),
    [model.state.cards]
  );
  const contradictionCards = useMemo(
    () => model.state.cards.filter((card) => card.zone === 'contradictions'),
    [model.state.cards]
  );
  const workspaceCards = useMemo(
    () => model.state.cards.filter((card) => card.zone === 'workspace'),
    [model.state.cards]
  );
  const framingLine = clean(concept?.description) || clean(model.state.header.prompt) || "What's the core insight here?";
  const hasMeaningfulDraft = stripHtml(model.state.hypothesis.html).length > 0;
  const hasStagedMaterial = model.state.cards.length > 0;
  const hasAgentTrail = model.state.agent.messages.length > 0
    || model.state.agent.comments.length > 0
    || (Array.isArray(model.changeDrafts) && model.changeDrafts.length > 0);
  const isFreshConcept = !hasMeaningfulDraft && !hasStagedMaterial && !hasAgentTrail;
  const workingClaim = useMemo(() => {
    const nonAgentSupport = supportCards.find((card) => !isAgentCard(card));
    if (nonAgentSupport) return nonAgentSupport;
    const nonAgentWorkspace = workspaceCards.find((card) => !isAgentCard(card));
    if (nonAgentWorkspace) return nonAgentWorkspace;
    const support = supportCards[0];
    if (support && !isAgentCard(support)) return support;
    const workspace = workspaceCards[0];
    if (workspace && !isAgentCard(workspace)) return workspace;
    return null;
  }, [supportCards, workspaceCards]);
  const pressurePoint = useMemo(() => {
    const nonAgentContradiction = contradictionCards.find((card) => !isAgentCard(card));
    if (nonAgentContradiction) return nonAgentContradiction;
    return contradictionCards[0] || null;
  }, [contradictionCards]);
  const slashItems = useMemo(() => (
    [
      ...createArtifactSlashItems(),
      ...model.state.cards
      .filter((card) => card && card.id)
      .slice(0, 6)
      .map((card) => ({
        id: `stream-card-${card.id}`,
        label: `Insert ${zoneLabel(card.zone)}: ${truncate(card.title || card.content || 'Source', 44)}`,
        description: truncate(card.whyItMatters || card.source || card.type || 'Bring this source into the draft.', 80),
        keywords: [clean(card.zone), clean(card.type), 'evidence', 'concept'].filter(Boolean),
        intent: 'artifact',
        artifactType: clean(card.zone) === 'questions' ? 'question' : 'evidence',
        prioritizeForQuery: clean(card.zone) === 'questions' ? ['question'] : ['evidence', 'support', 'tension'],
        onSelect: ({ editor }) => onDropCard?.(card, null, editor)
      }))
    ]
  ), [model.state.cards, onDropCard]);
  const runAction = async (action) => {
    onRunAction?.('assistant');
    await model.actions.dispatchConceptAction(action);
  };

  const [isCardDragging, setIsCardDragging] = useState(false);
  const [isDropzoneHover, setIsDropzoneHover] = useState(false);
  useEffect(() => {
    const matchesEvidenceDrag = (event) => {
      const types = event?.dataTransfer?.types;
      if (!types) return false;
      try {
        return Array.from(types).includes('application/x-noeis-card-id');
      } catch (_) {
        return false;
      }
    };
    const handleStart = (event) => {
      if (matchesEvidenceDrag(event)) setIsCardDragging(true);
    };
    const handleEnd = () => {
      setIsCardDragging(false);
      setIsDropzoneHover(false);
    };
    document.addEventListener('dragstart', handleStart);
    document.addEventListener('dragend', handleEnd);
    document.addEventListener('drop', handleEnd);
    return () => {
      document.removeEventListener('dragstart', handleStart);
      document.removeEventListener('dragend', handleEnd);
      document.removeEventListener('drop', handleEnd);
    };
  }, []);
  const handleDropzoneDragOver = useCallback((event) => {
    if (!isCardDragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDropzoneHover(true);
  }, [isCardDragging]);
  const handleDropzoneDragLeave = useCallback(() => {
    setIsDropzoneHover(false);
  }, []);
  const handleDropzoneDrop = useCallback((event) => {
    if (!isCardDragging) return;
    event.preventDefault();
    setIsDropzoneHover(false);
    setIsCardDragging(false);
    const cardId = event.dataTransfer.getData('application/x-noeis-card-id');
    if (!cardId) return;
    const card = model.state.cards.find((c) => String(c.id) === String(cardId));
    if (card) onDropCard?.(card, null, null);
  }, [isCardDragging, model.state.cards, onDropCard]);

  return (
    <div className={`concept-editorial-view ${isFreshConcept ? 'is-fresh' : ''}`.trim()}>
      {!isFreshConcept && (
        <div className="concept-editorial-view__meta">
          <span>Active reasoning draft / {model.hypothesisVersion.label || 'v1'}</span>
          {onShareConcept ? (
            <button
              type="button"
              className="concept-editorial-view__share-button"
              onClick={onShareConcept}
              data-testid="concept-editorial-view-share-button"
            >
              Share
            </button>
          ) : null}
        </div>
      )}

      <header className="concept-editorial-view__header">
        <h1>{model.state.header.title || concept?.name || 'Untitled idea'}</h1>
        <p>
          {isFreshConcept
            ? 'Start with the claim in your own words. Pull support, tension, and remembered sources into the rail when the page has something worth testing.'
            : framingLine}
        </p>
      </header>

      <article className="concept-editorial-view__manuscript">
        <div className="concept-editorial-view__editor-shell">
          <div className="concept-editorial-view__editor-meta">
            <span>{isFreshConcept ? 'Fresh concept' : 'Working draft'}</span>
            {!isFreshConcept && (
              <div>
                <button type="button" disabled={model.agentBusy} onClick={() => runAction(CONCEPT_ACTIONS.STRENGTHEN_DRAFT)}>Strengthen</button>
                <button type="button" disabled={model.agentBusy} onClick={() => model.actions.dispatchConceptAction(CONCEPT_ACTIONS.CHALLENGE_DRAFT)}>Challenge</button>
                <button type="button" disabled={model.agentBusy} onClick={() => model.actions.dispatchConceptAction(CONCEPT_ACTIONS.CLARIFY_DRAFT)}>Clarify</button>
                <button type="button" disabled={model.agentBusy} onClick={() => model.actions.dispatchConceptAction(CONCEPT_ACTIONS.SAVE_VERSION)}>Save version</button>
              </div>
            )}
          </div>
          <IdeaWorkbenchHypothesisEditor
            value={clean(model.state.hypothesis.html) || '<p></p>'}
            onChange={model.actions.updateHypothesisHtml}
            droppableId="concept-editorial-hypothesis"
            isReceivingDrop={isReceivingDrop}
            onEditorReady={onEditorReady}
            onDropCard={onDropCard}
            slashItems={slashItems}
            hideToolbar={isFreshConcept}
            placeholder={isFreshConcept
              ? 'Write the live claim, question, or hunch here. Keep it provisional.'
              : 'Write the current hypothesis here. Let it stay provisional and editable.'}
          />
        </div>

        {isFreshConcept && (
          <div className="concept-editorial-view__starter">
            <div className="concept-editorial-view__starter-copy">
              <span>Start options</span>
              <p>Stay blank and write, or bring in a light scaffold if you want help starting.</p>
            </div>
            <div className="concept-editorial-view__starter-actions">
              <button type="button" onClick={() => onOpenTemplatePicker?.()}>
                Use starter scaffold
              </button>
              <button type="button" disabled={model.agentBusy} onClick={() => runAction(CONCEPT_ACTIONS.PULL_RELATED_SOURCES)}>
                Pull remembered sources
              </button>
            </div>
          </div>
        )}

        {!isFreshConcept && workingClaim && (
          <blockquote className="concept-editorial-view__synthesis-point">
            <span>Synthesis point</span>
            <p>{cardExcerpt(workingClaim, 240)}</p>
            <div>{clean(workingClaim.source) || clean(workingClaim.type) || 'Workbench evidence'}</div>
          </blockquote>
        )}

        {!isFreshConcept && pressurePoint && (
          <aside className="concept-editorial-view__pressure-point" data-testid="concept-inline-contradiction">
            <span>Pressure point</span>
            <p>{cardExcerpt(pressurePoint, 220)}</p>
            <div>{clean(pressurePoint.source) || clean(pressurePoint.type) || 'Contradiction in play'}</div>
          </aside>
        )}

        {!isFreshConcept && (
          <div
            className={[
              'concept-editorial-view__dropzone',
              isCardDragging ? 'is-active' : '',
              isDropzoneHover ? 'is-hovering' : ''
            ].filter(Boolean).join(' ')}
            data-testid="concept-evidence-dropzone"
            onDragOver={handleDropzoneDragOver}
            onDragEnter={handleDropzoneDragOver}
            onDragLeave={handleDropzoneDragLeave}
            onDrop={handleDropzoneDrop}
            aria-live="polite"
          >
            <span aria-hidden="true">⊕</span>
            <p>{isDropzoneHover ? 'Drop to integrate' : 'Drag evidence here to integrate'}</p>
          </div>
        )}
      </article>
    </div>
  );
};

export const ConceptEvidenceStreamRail = ({
  concept,
  model,
  onIntegrateCard,
  activeSection = 'assistant',
  onOpenTemplatePicker,
  personalAgents = [],
  referencePullInSlot = null
}) => {
  const contradictionCards = model.state.cards.filter((card) => card.zone === 'contradictions');
  const supportCards = model.state.cards.filter((card) => card.zone === 'supports');
  const workspaceCards = model.state.cards.filter((card) => card.zone === 'workspace');
  const questionCards = model.state.cards.filter((card) => card.zone === 'questions');
  const conceptServingCards = useMemo(
    () => [...contradictionCards, ...supportCards, ...workspaceCards, ...questionCards],
    [contradictionCards, questionCards, supportCards, workspaceCards]
  );
  const allEvidenceCards = useMemo(
    () => [...contradictionCards, ...supportCards, ...workspaceCards, ...questionCards],
    [contradictionCards, questionCards, supportCards, workspaceCards]
  );
  const highlightCards = allEvidenceCards.filter(isHighlightCard);
  const sourceCards = allEvidenceCards.filter(isSourceCard);
  const recentMessages = useMemo(
    () => model.state.agent.messages
      .filter((message) => clean(message?.text))
      .slice(-4)
      .reverse(),
    [model.state.agent.messages]
  );
  const latestAssistantMessage = useMemo(
    () => recentMessages.find((message) => clean(message?.role) !== 'user') || null,
    [recentMessages]
  );
  const latestSuggestedCardIds = useMemo(
    () => new Set((latestAssistantMessage?.suggestedCards || []).map((card) => String(card.id))),
    [latestAssistantMessage]
  );
  const suggestedCardsFirst = useMemo(() => {
    if (latestSuggestedCardIds.size === 0) return [];
    const ordered = allEvidenceCards.filter((card) => latestSuggestedCardIds.has(String(card.id)));
    const fallback = (latestAssistantMessage?.suggestedCards || []).filter(
      (card) => !ordered.some((existing) => String(existing.id) === String(card.id))
    );
    return [...ordered, ...fallback];
  }, [allEvidenceCards, latestAssistantMessage, latestSuggestedCardIds]);
  const streamCards = useMemo(() => {
    const base =
      activeSection === 'highlights'
        ? (highlightCards.length > 0 ? highlightCards : allEvidenceCards)
        : activeSection === 'sources'
          ? (sourceCards.length > 0 ? sourceCards : allEvidenceCards)
        : activeSection === 'annotations'
            ? (sourceCards.length > 0 ? sourceCards : allEvidenceCards)
            : (conceptServingCards.length > 0 ? conceptServingCards : allEvidenceCards);
    const seen = new Set();
    return [...suggestedCardsFirst, ...base]
      .filter((card) => {
        const key = String(card.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, activeSection === 'annotations' ? 4 : 4);
  }, [activeSection, allEvidenceCards, conceptServingCards, highlightCards, sourceCards, suggestedCardsFirst]);
  const hypothesisComments = useMemo(
    () => model.state.agent.comments.filter((comment) => comment.target === 'hypothesis'),
    [model.state.agent.comments]
  );
  const pendingRevision = useMemo(
    () => [...hypothesisComments].reverse().find((comment) => comment.suggestedHtml && clean(comment.status).toLowerCase() === 'pending') || null,
    [hypothesisComments]
  );
  const latestComment = useMemo(
    () => [...hypothesisComments].reverse().find((comment) => comment.id !== pendingRevision?.id) || model.state.agent.comments[0] || null,
    [hypothesisComments, model.state.agent.comments, pendingRevision?.id]
  );
  const pendingChangeDrafts = useMemo(
    () => (Array.isArray(model.changeDrafts) ? model.changeDrafts : []).slice(0, 3),
    [model.changeDrafts]
  );
  const freshness = model.freshness || { isStale: false, summary: '', preview: [] };
  const [partnerInput, setPartnerInput] = useState('');
  const isFreshConcept = stripHtml(model.state.hypothesis.html).length === 0
    && model.state.cards.length === 0
    && model.state.agent.messages.length === 0
    && model.state.agent.comments.length === 0
    && (!Array.isArray(model.changeDrafts) || model.changeDrafts.length === 0);
  const quickActions = [
    { id: CONCEPT_ACTIONS.PULL_SUPPORT, label: 'Pull support' },
    { id: CONCEPT_ACTIONS.FIND_TENSION, label: 'Find tension' },
    { id: CONCEPT_ACTIONS.PULL_RELATED_SOURCES, label: 'Related sources' },
    { id: CONCEPT_ACTIONS.SURFACE_OPEN_QUESTIONS, label: 'Open questions' },
    { id: CONCEPT_ACTIONS.CLARIFY_DRAFT, label: 'Clarify draft' },
    { id: CONCEPT_ACTIONS.PREPARE_UPDATE, label: 'Review freshness' }
  ];
  const notebookHandoffTemplates = useMemo(
    () => CONCEPT_NOTEBOOK_DRAFT_TEMPLATES.filter((template) => template.id !== 'default'),
    []
  );
  const activePersonalAgents = useMemo(
    () => (Array.isArray(personalAgents) ? personalAgents : []).filter((agent) => clean(agent?.status).toLowerCase() === 'active'),
    [personalAgents]
  );
  const pulledMaterialCards = useMemo(() => {
    const suggestedWorkspaceCards = suggestedCardsFirst.filter(
      (card) => clean(card?.zone).toLowerCase() === 'workspace'
    );
    if (suggestedWorkspaceCards.length > 0) {
      return suggestedWorkspaceCards.slice(0, 4);
    }
    return streamCards
      .filter((card) => clean(card?.zone).toLowerCase() === 'workspace')
      .slice(0, 4);
  }, [streamCards, suggestedCardsFirst]);
  const hasConversation = model.agentBusy || model.agentError || recentMessages.length > 0 || Boolean(latestComment);
  const hasPreparedMoves = freshness.isStale || pendingChangeDrafts.length > 0 || Boolean(pendingRevision);
  const tickerLines = useMemo(() => {
    const lines = [];
    const title = model.state.header?.title || concept?.name || 'current concept';
    if (model.agentBusy) {
      lines.push('reading the concept draft');
      lines.push(`testing ${title}`);
      lines.push('looking for support and pressure');
      return lines;
    }
    if (latestAssistantMessage) lines.push(formatStreamMessage(latestAssistantMessage));
    if (supportCards.length > 0) lines.push(`${supportCards.length} support signal${supportCards.length === 1 ? '' : 's'} staged`);
    if (contradictionCards.length > 0) lines.push(`${contradictionCards.length} tension${contradictionCards.length === 1 ? '' : 's'} visible`);
    if (questionCards.length > 0) lines.push(`${questionCards.length} open question${questionCards.length === 1 ? '' : 's'} waiting`);
    if (lines.length === 0) lines.push(`anchored to ${title}`);
    return lines.slice(0, 3);
  }, [
    concept?.name,
    contradictionCards.length,
    latestAssistantMessage,
    model.agentBusy,
    model.state.header?.title,
    questionCards.length,
    supportCards.length
  ]);

  const handleSend = async () => {
    const next = clean(partnerInput);
    if (!next) return;
    await model.actions.sendAgentMessage(next);
    setPartnerInput('');
  };
  const handleComposerKeyDown = async (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    await handleSend();
  };

  return (
    <div className="concept-editorial-evidence">
      <div className="concept-editorial-evidence__header">
        <h3>{AGENT_DISPLAY_NAME}</h3>
        <p>Prompt first, then review the conversation, then decide what pulled material belongs on the page.</p>
      </div>

      <AgentTicker
        className="concept-editorial-evidence__ticker"
        label="Thought partner computation trace"
        lines={tickerLines}
        state={model.agentBusy ? 'working' : 'idle'}
      />

      {referencePullInSlot && (
        <div className="concept-editorial-evidence__reference-pull-in">
          {referencePullInSlot}
        </div>
      )}

      {isFreshConcept && (
        <div className="concept-editorial-evidence__starter-block">
          <div className="concept-editorial-evidence__starter-copy">
            <span>Fresh concept</span>
            <p>Ask the rail to recover old material, or open a light scaffold without turning the page into a form.</p>
          </div>
          <div className="concept-editorial-evidence__starter-actions">
            <button type="button" onClick={() => onOpenTemplatePicker?.()}>
              Starter scaffold
            </button>
            <button type="button" disabled={model.agentBusy} onClick={() => model.actions.dispatchConceptAction(CONCEPT_ACTIONS.PULL_RELATED_SOURCES)}>
              Remembered sources
            </button>
          </div>
        </div>
      )}

      <div className="concept-editorial-evidence__prompt-block">
        <div className="concept-editorial-evidence__section-head">
          <span>Prompt set</span>
          <span>{isFreshConcept ? 'Start light' : 'Pre-defined moves'}</span>
        </div>
        <div className="concept-editorial-evidence__quick-actions">
          {(isFreshConcept ? quickActions.filter((action) => [
            CONCEPT_ACTIONS.PULL_RELATED_SOURCES,
            CONCEPT_ACTIONS.FIND_TENSION,
            CONCEPT_ACTIONS.SURFACE_OPEN_QUESTIONS
          ].includes(action.id)) : quickActions).map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => model.actions.dispatchConceptAction(action.id)}
              disabled={model.agentBusy}
            >
              {action.label}
            </button>
          ))}
        </div>
        <p className="concept-editorial-evidence__prompt-note">
          {isFreshConcept
            ? 'Ask for support, contradiction, or the buried source you half-remember. The rail does the digging so the page can stay focused.'
            : 'Ask for support, contradiction, a cleaner draft, or the piece of prior reading you know is somewhere in the archive.'}
        </p>
        <div className="concept-editorial-evidence__composer">
          <textarea
            value={partnerInput}
            onChange={(event) => setPartnerInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask for what this page needs next."
          />
          <button type="button" onClick={handleSend} disabled={!clean(partnerInput) || model.agentBusy}>↗</button>
        </div>
      </div>

      <section className="concept-editorial-evidence__section">
        <div className="concept-editorial-evidence__section-head">
          <span>Conversation</span>
          <span>{model.agentBusy ? 'Thinking' : `${AGENT_DISPLAY_NAME} + chat`}</span>
        </div>
        <p className="concept-editorial-evidence__section-copy">
          Keep the exchange simple here. Ask, read the reply, then pull only the material that earns space in the draft.
        </p>
        {hasConversation ? (
          <div className="concept-editorial-evidence__messages" aria-live="polite">
          {model.agentBusy && (
            <div className="concept-editorial-evidence__status">
              {model.agentModeLabel ? `${model.agentModeLabel}…` : `${AGENT_DISPLAY_NAME} is thinking…`}
            </div>
          )}
          {model.agentError && (
            <div className="concept-editorial-evidence__status is-error">
              {model.agentError}
            </div>
          )}
          {recentMessages.map((message) => (
            <article
              key={message.id}
              className={`concept-editorial-evidence__message concept-editorial-evidence__message--${clean(message.role) || 'assistant'}`}
            >
              <div className="concept-editorial-evidence__message-meta">
                <span>{clean(message.role) === 'user' ? 'You' : AGENT_DISPLAY_NAME}</span>
              </div>
              <p>{formatStreamMessage(message)}</p>
            </article>
          ))}
          {!recentMessages.length && latestComment && (
            <article className="concept-editorial-evidence__message">
              <div className="concept-editorial-evidence__message-meta">
                <span>{AGENT_DISPLAY_NAME}</span>
              </div>
              <p>{latestComment.body}</p>
            </article>
          )}
          </div>
        ) : (
          <p className="concept-editorial-evidence__empty">No conversation yet. Start with one prompt above.</p>
        )}
      </section>

      <section className="concept-editorial-evidence__section">
        <div className="concept-editorial-evidence__section-head">
          <span>Pulled material</span>
          <span>{pulledMaterialCards.length > 0 ? `${pulledMaterialCards.length} ready` : 'Waiting'}</span>
        </div>
        <p className="concept-editorial-evidence__section-copy">
          Articles, highlights, and source leads the partner surfaced for this concept.
        </p>
        {pulledMaterialCards.length > 0 ? (
          <div className="concept-editorial-evidence__stack">
            {pulledMaterialCards.map((card) => (
              <DraggableEvidenceCard
                key={card.id}
                card={card}
                onIntegrate={(nextCard) => {
                  if (onIntegrateCard) {
                    onIntegrateCard(nextCard);
                    return;
                  }
                  if (model.state.cards.some((item) => String(item.id) === String(nextCard?.id))) {
                    model.actions.insertCardIntoHypothesis(String(nextCard.id), { removeCard: true });
                    return;
                  }
                  model.actions.addSuggestedCard(nextCard, 'workspace');
                  model.actions.updateHypothesisHtml(
                    `${model.state.hypothesis.html || '<p></p>'}${formatEditorialEvidenceHtml(nextCard)}`
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <p className="concept-editorial-evidence__empty">Pulled sources and highlights will collect here after the next agent move.</p>
        )}
      </section>

      {hasPreparedMoves && (
        <section className="concept-editorial-evidence__section">
          <div className="concept-editorial-evidence__section-head">
            <span>Prepared moves</span>
            <span>Apply or hold</span>
          </div>
          <p className="concept-editorial-evidence__section-copy">
            Staged support, tension, and revision work waiting for your call.
          </p>

          {freshness.isStale && (
            <div className="concept-editorial-evidence__result concept-editorial-evidence__result--proposal">
              <div className="concept-editorial-evidence__result-head">
                <span>Fresh material waiting</span>
                <span>{freshness.unreviewedCount || 0} newer</span>
              </div>
              <p>{freshness.summary}</p>
              {Array.isArray(freshness.preview) && freshness.preview.length > 0 && (
                <ul>
                  {freshness.preview.slice(0, 3).map((item, index) => (
                    <li key={`freshness-${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              )}
              <div className="concept-editorial-evidence__proposal-actions">
                <button type="button" onClick={() => model.actions.markReviewed?.()}>
                  Mark current
                </button>
              </div>
            </div>
          )}

          {pendingChangeDrafts.map((draft) => (
            <div key={draft.id} className="concept-editorial-evidence__result concept-editorial-evidence__result--proposal">
              <div className="concept-editorial-evidence__result-head">
                <span>{draft.title}</span>
                <span>{getDraftTargetLabel(draft)}</span>
              </div>
              <p>{draft.summary}</p>
              {clean(draft.caption) && (
                <p className="concept-editorial-evidence__proposal-note">{draft.caption}</p>
              )}
              {Array.isArray(draft.cards) && draft.cards.length > 0 && (
                <ul className="concept-editorial-evidence__proposal-list">
                  {draft.cards.slice(0, 3).map((card) => (
                    <li key={`${draft.id}-${card.id}`}>
                      <span>{zoneLabel(card.zone)}</span>
                      <strong>{card.title || truncate(card.content, 64) || 'Untitled source'}</strong>
                      {clean(card.source) && <em>{card.source}</em>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="concept-editorial-evidence__proposal-actions">
                <button type="button" onClick={() => model.actions.applyChangeDraft(draft.id)}>
                  {getDraftApplyLabel(draft)}
                </button>
                <button type="button" onClick={() => model.actions.dismissChangeDraft(draft.id)}>
                  Not now
                </button>
              </div>
            </div>
          ))}

          {pendingRevision && (
            <div className="concept-editorial-evidence__result concept-editorial-evidence__result--proposal">
              <div className="concept-editorial-evidence__result-head">
                <span>Pending revision</span>
                <span>Approval required</span>
              </div>
              <p>{pendingRevision.body}</p>
              {clean(pendingRevision.caption) && (
                <p className="concept-editorial-evidence__proposal-note">{pendingRevision.caption}</p>
              )}
              <div className="concept-editorial-evidence__proposal-actions">
                <button type="button" onClick={() => model.actions.acceptAgentComment(pendingRevision.id)}>
                  Apply revision
                </button>
                <button type="button" onClick={() => model.actions.dismissAgentComment(pendingRevision.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {!isFreshConcept && (
        <section className="concept-editorial-evidence__section concept-editorial-evidence__section--handoff">
          <div className="concept-editorial-evidence__section-head">
            <span>Notebook handoff</span>
            <span>Downstream draft</span>
          </div>
          <p className="concept-editorial-evidence__section-copy">
            Spin the concept into a downstream draft without losing the concept as the source of truth.
          </p>
          <div className="concept-editorial-evidence__handoff-options">
            {notebookHandoffTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => model.actions.dispatchConceptAction(CONCEPT_ACTIONS.CREATE_NOTEBOOK_DRAFT, {
                  template: template.id
                })}
                disabled={model.agentBusy}
              >
                <strong>{template.label}</strong>
                <span>{template.description}</span>
              </button>
            ))}
          </div>
          <div className="concept-editorial-evidence__section-head" style={{ marginTop: 18 }}>
            <span>Agent handoff</span>
            <span>Scoped delegation</span>
          </div>
          <p className="concept-editorial-evidence__section-copy">
            Send the live concept to a specialist agent with the current claim, support, tension, and open questions already attached.
          </p>
          {activePersonalAgents.length > 0 ? (
            <div className="concept-editorial-evidence__handoff-options">
              {activePersonalAgents.map((agent) => {
                const roleLabel = Array.isArray(agent?.preferredWorkerRoles) && agent.preferredWorkerRoles.length > 0
                  ? agent.preferredWorkerRoles[0]
                  : 'specialist';
                return (
                  <button
                    key={agent._id}
                    type="button"
                    onClick={() => model.actions.dispatchConceptAction(CONCEPT_ACTIONS.CREATE_AGENT_HANDOFF, {
                      requestedActorId: String(agent._id || ''),
                      requestedActorName: String(agent.name || '')
                    })}
                    disabled={model.agentBusy}
                  >
                    <strong>{agent.name || 'Specialist agent'}</strong>
                    <span>{roleLabel}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="concept-editorial-evidence__empty">
              No active specialist agents yet. <a href="/integrations#personal-agents">Set one up</a>.
            </p>
          )}
        </section>
      )}
    </div>
  );
};

export default ConceptEvidenceStreamView;
