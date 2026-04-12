import React, { useMemo, useState } from 'react';
import IdeaWorkbenchHypothesisEditor from './idea-workbench/IdeaWorkbenchHypothesisEditor';
import { sanitizeAgentReplyText } from './idea-workbench/useIdeaWorkbenchModel';
import { CONCEPT_ACTIONS } from './idea-workbench/conceptActionDispatch';

const clean = (value) => String(value || '').trim();
const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
const escapeAttribute = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;');
const truncate = (value = '', limit = 220) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};
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

export const formatEditorialEvidenceHtml = (card) => {
  if (!card) return '<p></p>';
  const source = clean(card.source) || clean(card.title) || 'Source';
  const content = clean(card.content) || clean(card.title) || 'Material';
  const whyItMatters = clean(card.whyItMatters);
  return [
    `<blockquote data-source-key="${escapeAttribute(clean(card.sourceKey || card.id))}"><p>${escapeHtml(content)}</p></blockquote>`,
    `<p><em>From ${escapeHtml(source)}.</em></p>`,
    whyItMatters ? `<p>${escapeHtml(whyItMatters)}</p>` : ''
  ].filter(Boolean).join('');
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
        <span>⋮</span>
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
  onRunAction
}) => {
  const supportCards = useMemo(
    () => model.state.cards.filter((card) => card.zone === 'supports'),
    [model.state.cards]
  );
  const workspaceCards = useMemo(
    () => model.state.cards.filter((card) => card.zone === 'workspace'),
    [model.state.cards]
  );
  const framingLine = clean(concept?.description) || clean(model.state.header.prompt) || "What's the core insight here?";
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
  const runAction = async (action) => {
    onRunAction?.('assistant');
    await model.actions.dispatchConceptAction(action);
  };

  return (
    <div className="concept-editorial-view">
      <div className="concept-editorial-view__meta">
        <span>Active reasoning draft / {model.hypothesisVersion.label || 'v1'}</span>
      </div>

      <header className="concept-editorial-view__header">
        <h1>{model.state.header.title || concept?.name || 'Untitled idea'}</h1>
        <p>{framingLine}</p>
      </header>

      <article className="concept-editorial-view__manuscript">
        <div className="concept-editorial-view__editor-shell">
          <div className="concept-editorial-view__editor-meta">
            <span>Working draft</span>
            <div>
              <button type="button" disabled={model.agentBusy} onClick={() => runAction(CONCEPT_ACTIONS.STRENGTHEN_DRAFT)}>Strengthen</button>
              <button type="button" disabled={model.agentBusy} onClick={() => model.actions.dispatchConceptAction(CONCEPT_ACTIONS.CHALLENGE_DRAFT)}>Challenge</button>
              <button type="button" disabled={model.agentBusy} onClick={() => model.actions.dispatchConceptAction(CONCEPT_ACTIONS.CLARIFY_DRAFT)}>Clarify</button>
              <button type="button" disabled={model.agentBusy} onClick={() => model.actions.dispatchConceptAction(CONCEPT_ACTIONS.SAVE_VERSION)}>Save version</button>
            </div>
          </div>
          <IdeaWorkbenchHypothesisEditor
            value={clean(model.state.hypothesis.html) || '<p></p>'}
            onChange={model.actions.updateHypothesisHtml}
            droppableId="concept-editorial-hypothesis"
            isReceivingDrop={isReceivingDrop}
            onEditorReady={onEditorReady}
            onDropCard={onDropCard}
          />
        </div>

        {workingClaim && (
          <blockquote className="concept-editorial-view__synthesis-point">
            <span>Synthesis point</span>
            <p>{cardExcerpt(workingClaim, 240)}</p>
            <div>{clean(workingClaim.source) || clean(workingClaim.type) || 'Workbench evidence'}</div>
          </blockquote>
        )}

        <div className="concept-editorial-view__dropzone">
          <span>⊕</span>
          <p>Drag evidence here to integrate</p>
        </div>
      </article>
    </div>
  );
};

export const ConceptEvidenceStreamRail = ({ concept, model, onIntegrateCard, activeSection = 'assistant' }) => {
  const supportCards = model.state.cards.filter((card) => card.zone === 'supports');
  const workspaceCards = model.state.cards.filter((card) => card.zone === 'workspace');
  const allEvidenceCards = useMemo(
    () => [...supportCards, ...workspaceCards],
    [supportCards, workspaceCards]
  );
  const highlightCards = allEvidenceCards.filter(isHighlightCard);
  const sourceCards = allEvidenceCards.filter((card) => !isHighlightCard(card));
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
            : (supportCards.length > 0 ? supportCards : workspaceCards);
    const seen = new Set();
    return [...suggestedCardsFirst, ...base]
      .filter((card) => {
        const key = String(card.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, activeSection === 'annotations' ? 4 : 4);
  }, [activeSection, allEvidenceCards, highlightCards, sourceCards, suggestedCardsFirst, supportCards, workspaceCards]);
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
  const streamHeading = useMemo(() => {
    if (activeSection === 'sources') {
      return { title: 'Context margin', subtitle: 'Source memory close to the draft' };
    }
    if (activeSection === 'highlights') {
      return { title: 'Context margin', subtitle: 'Quoted fragments worth pulling in' };
    }
    if (activeSection === 'annotations') {
      return { title: 'Context margin', subtitle: 'Notes about pressure, gaps, and revisions' };
    }
    return { title: 'Context margin', subtitle: 'Support, contradiction, and open pressure' };
  }, [activeSection]);
  const [partnerInput, setPartnerInput] = useState('');
  const quickActions = [
    { id: CONCEPT_ACTIONS.PULL_SUPPORT, label: 'Pull support' },
    { id: CONCEPT_ACTIONS.FIND_TENSION, label: 'Find tension' },
    { id: CONCEPT_ACTIONS.PULL_RELATED_SOURCES, label: 'Related sources' },
    { id: CONCEPT_ACTIONS.SURFACE_OPEN_QUESTIONS, label: 'Open questions' },
    { id: CONCEPT_ACTIONS.CLARIFY_DRAFT, label: 'Clarify draft' },
    { id: CONCEPT_ACTIONS.PREPARE_UPDATE, label: 'Review freshness' },
    { id: CONCEPT_ACTIONS.CREATE_NOTEBOOK_DRAFT, label: 'Open notebook draft' }
  ];

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
        <h3>{streamHeading.title}</h3>
        <p>{streamHeading.subtitle}</p>
      </div>

      <div className="concept-editorial-evidence__prompt-block">
        <p className="concept-editorial-evidence__prompt-note">
          Ask for support, contradiction, a cleaner draft, or the piece of prior reading you know is somewhere in the archive.
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
        <div className="concept-editorial-evidence__quick-actions">
          {quickActions.map((action) => (
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
      </div>

      {freshness.isStale && (
        <div className="concept-editorial-evidence__result concept-editorial-evidence__result--proposal">
          <div className="concept-editorial-evidence__result-head">
            <span>Fresh material waiting</span>
            <span>{freshness.unreviewedCount || 0} newer</span>
          </div>
          <p>{freshness.summary}</p>
          {Array.isArray(freshness.preview) && freshness.preview.length > 0 && (
            <ul>
              {freshness.preview.slice(0, 3).map((item) => (
                <li key={`freshness-${item}`}>{item}</li>
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
            <span>{draft.cards?.length || 0} queued</span>
          </div>
          <p>{draft.summary}</p>
          {clean(draft.caption) && (
            <p className="concept-editorial-evidence__proposal-note">{draft.caption}</p>
          )}
          {Array.isArray(draft.cards) && draft.cards.length > 0 && (
            <ul>
              {draft.cards.slice(0, 3).map((card) => (
                <li key={`${draft.id}-${card.id}`}>{card.title || truncate(card.content, 64) || 'Untitled source'}</li>
              ))}
            </ul>
          )}
          <div className="concept-editorial-evidence__proposal-actions">
            <button type="button" onClick={() => model.actions.applyChangeDraft(draft.id)}>
              Apply change
            </button>
            <button type="button" onClick={() => model.actions.dismissChangeDraft(draft.id)}>
              Dismiss
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

      {(model.agentBusy || model.agentError || recentMessages.length > 0) && (
        <div className="concept-editorial-evidence__messages" aria-live="polite">
          {model.agentBusy && (
            <div className="concept-editorial-evidence__status">
              {model.agentModeLabel ? `${model.agentModeLabel}…` : 'The Partner is thinking…'}
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
                  <span>{clean(message.role) === 'user' ? 'You' : 'Partner'}</span>
                </div>
                <p>{formatStreamMessage(message)}</p>
              </article>
            ))}
        </div>
      )}

      {suggestedCardsFirst.length > 0 && (
        <div className="concept-editorial-evidence__result">
          <div className="concept-editorial-evidence__result-head">
            <span>Fresh pulls</span>
            <span>{suggestedCardsFirst.length} attached</span>
          </div>
          <p>
            The newest material is surfaced first so you can decide what belongs in the draft.
          </p>
          <ul>
            {suggestedCardsFirst.slice(0, 3).map((card) => (
              <li key={`result-${card.id}`}>{card.title || truncate(card.content, 64) || 'Untitled evidence'}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="concept-editorial-evidence__stack">
        {activeSection === 'annotations' && latestComment && (
          <article className="concept-editorial-evidence__item concept-editorial-evidence__item--agent">
            <div className="concept-editorial-evidence__item-meta">
              <span>Recent signal</span>
              <span>{latestComment.tone || 'signal'}</span>
            </div>
            <p>{latestComment.body}</p>
          </article>
        )}

        {streamCards.map((card) => (
          <DraggableEvidenceCard
            key={card.id}
            card={card}
            onIntegrate={(nextCard) => {
              if (onIntegrateCard) {
                onIntegrateCard(nextCard);
                return;
              }
              if (model.state.cards.some((item) => String(item.id) === String(nextCard?.id))) {
                model.actions.insertCardIntoHypothesis(String(nextCard.id));
                return;
              }
              model.actions.addSuggestedCard(nextCard, 'workspace');
              model.actions.updateHypothesisHtml(
                `${model.state.hypothesis.html || '<p></p>'}${formatEditorialEvidenceHtml(nextCard)}`
              );
            }}
          />
        ))}

        {activeSection !== 'annotations' && latestComment && (
          <article className="concept-editorial-evidence__item concept-editorial-evidence__item--agent">
            <div className="concept-editorial-evidence__item-meta">
              <span>Recent signal</span>
              <span>{latestComment.tone || 'signal'}</span>
            </div>
            <p>{latestComment.body}</p>
          </article>
        )}
      </div>
    </div>
  );
};

export default ConceptEvidenceStreamView;
