import React from 'react';
import { Button, QuietButton, SectionHeader, TagChip } from '../../ui';
import CalmIndexView, { QuestionIndexEmptyState } from '../CalmIndexView';
import { describeThreadMotionNote } from '../calmIndexModel';
import ReferencesPanel from '../../ReferencesPanel';
import ThoughtPartnerPanel from '../../agent/ThoughtPartnerPanel';
import AgentArtifactDraftsPanel from '../../agent/AgentArtifactDraftsPanel';
import EditorialRail, { CalmEmptyLine, SidebarSkeletonRows } from '../EditorialRail';
import QuestionEditor from './QuestionEditor';
import { AGENT_DISPLAY_NAME } from '../../../constants/agentIdentity';

const previewText = (value = '') => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const questionCounterSignalPattern = /\b(counter|contradict|against|but|however|although|risk|tension|weak|problem|trade[-\s]?off|fails?|doubt|uncertain)\b/i;
const isQuestionCounterSignal = (value = '') => questionCounterSignalPattern.test(String(value || ''));
const formatQuestionEvidenceSource = (item = {}) => String(
  item.metadata?.articleTitle
  || item.metadata?.sourceTitle
  || item.metadata?.title
  || item.sourceTitle
  || item.title
  || ''
).trim();

const getQuestionSignalTerms = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length > 3)
);

const getQuestionLineConfidence = (supportCount, counterCount) => {
  if (!supportCount && !counterCount) return 'No evidence';
  if (supportCount && counterCount) return 'Balanced line';
  if (supportCount) return 'Support-heavy';
  return 'Counter-heavy';
};

const RelatedConceptTags = ({ items = [] }) => (
  items.length > 0 ? (
    <div className="concept-related-tags">
      {items.map((item) => {
        const name = item.metadata?.name || item.title || '';
        return (
          <TagChip key={item.objectId} to={`/think?tab=concepts&concept=${encodeURIComponent(name)}`}>
            {name || 'Concept'}
          </TagChip>
        );
      })}
    </div>
  ) : (
    <CalmEmptyLine>No related concepts yet.</CalmEmptyLine>
  )
);

const QuestionEditorialView = ({
  activeQuestion,
  activeQuestionData,
  activeSection,
  onChangeSection,
  partnerRailNavItems,
  onCreateQuestion,
  questionSaving,
  search,
  onSearchChange,
  questionStatus,
  onQuestionStatusChange,
  allQuestionsLoading,
  allQuestionsError,
  filteredQuestions,
  renderPartnerQuestionList,
  questionError,
  questionRelated,
  questionRelatedLoading,
  questionRelatedError,
  contextConnections,
  contextConnectionsLoading,
  contextConnectionsError,
  onAttachRelatedHighlight,
  renderThinkPostureStrip,
  onSaveQuestion,
  onRegisterQuestionInsert,
  onOpenSynthesis,
  queueThoughtPartnerPrompt,
  thoughtPartnerContext,
  thoughtPartnerContextMetadata,
  queuedThoughtPartnerPrompt,
  thoughtPartnerPostureProps,
  renderReferencePullIn,
  onQueueOrganizationPrompt,
  onMarkAnswered,
  onPromoteThinkObjectToWiki,
  wikiPromotionState,
  questionWikiPromotionTarget,
  conceptWikiPromotionTarget,
  wikiPromotionError,
  renderWikiPromotionTrace,
  questionScopedArtifactDraftsModel,
  onOpenThreadFromDraft,
  onCreateHandoffFromDraft,
  onQueueFollowUpLoopFromDraft,
  shelfRail = null,
  indexMotion = { inMotion: [], shelf: [] },
  indexOrientation = '',
  indexLoading = false,
  allQuestionsCount = 0,
  onCalmThreadSelect = null
}) => {
  const isQuestionIndex = !activeQuestionData;
  const relatedHighlights = Array.isArray(questionRelated?.highlights) ? questionRelated.highlights : [];
  const relatedConcepts = Array.isArray(questionRelated?.concepts) ? questionRelated.concepts : [];
  const scopedConnections = Array.isArray(contextConnections) ? contextConnections : [];

  const questionEvidenceHighlights = relatedHighlights.map(item => {
    const source = formatQuestionEvidenceSource(item);
    const snippet = previewText(item.snippet || item.metadata?.text || item.metadata?.note || source);
    return {
      id: item.objectId,
      objectId: item.objectId,
      sourceKind: 'Library highlight',
      title: source || item.title || 'Related highlight',
      quote: snippet || 'Candidate evidence from your library.',
      source,
      isCounter: item.evidenceTone === 'counter'
        || (item.evidenceTone !== 'support' && isQuestionCounterSignal(`${item.title || ''} ${snippet}`))
    };
  });
  const questionSupportSignals = [
    ...scopedConnections
      .filter(row => String(row.relationType || '').toLowerCase().includes('support'))
      .slice(0, 2)
      .map(row => ({
        id: row._id,
        sourceKind: 'Graph link',
        title: row.fromItem?.title || row.toItem?.title || 'Connected support',
        quote: row.relationType || 'supports',
        source: row.fromItem?.title || row.toItem?.title || ''
      })),
    ...questionEvidenceHighlights
      .filter(item => !item.isCounter)
      .slice(0, 2)
  ].slice(0, 3);
  const questionCounterSignals = [
    ...scopedConnections
      .filter(row => {
        const relation = String(row.relationType || '').toLowerCase();
        return relation.includes('contradict') || relation.includes('counter') || relation.includes('tension');
      })
      .slice(0, 2)
      .map(row => ({
        id: row._id,
        sourceKind: 'Graph link',
        title: row.fromItem?.title || row.toItem?.title || 'Counter signal',
        quote: row.relationType || 'counter',
        source: row.fromItem?.title || row.toItem?.title || ''
      })),
    ...questionEvidenceHighlights
      .filter(item => item.isCounter)
      .slice(0, 2)
  ].slice(0, 3);
  const questionSignalTotal = questionSupportSignals.length + questionCounterSignals.length;
  const questionSupportLean = questionSignalTotal
    ? Math.round((questionSupportSignals.length / questionSignalTotal) * 100)
    : 50;
  const questionLineAnchors = (Array.isArray(activeQuestionData?.blocks) ? activeQuestionData.blocks : [])
    .map((block, index) => ({
      id: block?.id || `question-line-${index}`,
      type: block?.type || 'paragraph',
      text: previewText(block?.text || activeQuestionData?.text || 'Question line'),
      challengeActive: Boolean(block?.challenge?.enabled)
    }))
    .filter(anchor => anchor.text)
    .slice(0, 4);
  if (!questionLineAnchors.length && activeQuestionData?.text) {
    questionLineAnchors.push({
      id: activeQuestionData._id || 'question-title',
      type: 'question',
      text: previewText(activeQuestionData.text)
    });
  }
  const questionEvidenceAnchors = questionLineAnchors.length
    ? questionLineAnchors
    : [{ id: 'question-evidence', type: 'question', text: 'Question line' }];
  const questionSignalScoreForLine = (signal, anchor, signalIndex, lineIndex) => {
    const anchorTerms = new Set(getQuestionSignalTerms(anchor?.text));
    const signalTerms = getQuestionSignalTerms([
      signal?.title,
      signal?.quote,
      signal?.source,
      signal?.sourceKind
    ].filter(Boolean).join(' '));
    const overlap = signalTerms.filter(term => anchorTerms.has(term)).length;
    if (overlap) return overlap + 10;
    return signalIndex === (lineIndex % Math.max(1, questionEvidenceAnchors.length)) ? 1 : 0;
  };
  const questionSignalsForLine = (signals, anchor, lineIndex) => (
    signals
      .map((signal, signalIndex) => ({
        signal,
        score: questionSignalScoreForLine(signal, anchor, signalIndex, lineIndex)
      }))
      .filter(item => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .map(item => item.signal)
      .slice(0, 2)
  );
  const questionChallengeEvidenceByBlockId = questionEvidenceAnchors.reduce((acc, anchor, index) => {
    acc[anchor.id] = {
      support: questionSignalsForLine(questionSupportSignals, anchor, index).map(signal => ({
        ...signal,
        stance: 'support'
      })),
      counter: questionSignalsForLine(questionCounterSignals, anchor, index).map(signal => ({
        ...signal,
        stance: 'counter'
      }))
    };
    return acc;
  }, {});

  const leftPanel = (
    <EditorialRail
      heroTitle={AGENT_DISPLAY_NAME}
      heroSubtitle="Contextual intelligence"
      ctaLabel="New inquiry"
      onCta={onCreateQuestion}
      ctaDisabled={questionSaving}
      navItems={partnerRailNavItems}
      activeNav={activeSection}
      onChangeNav={onChangeSection}
      sections={
        activeSection === 'sources'
          ? [
              {
                label: 'Search and status',
                content: (
                  <>
                    <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                      <input
                        type="text"
                        value={search}
                        placeholder="Search questions"
                        data-testid="question-index-search-input"
                        onChange={(event) => onSearchChange(event.target.value)}
                      />
                    </label>
                    <label className="think-index__filter">
                      <select value={questionStatus} onChange={(event) => onQuestionStatusChange(event.target.value)}>
                        <option value="open">Open</option>
                        <option value="answered">Answered</option>
                      </select>
                    </label>
                    {allQuestionsError && <p className="status-message error-message">{allQuestionsError}</p>}
                    {questionError && <p className="status-message error-message">{questionError}</p>}
                  </>
                )
              },
              {
                label: 'Working questions',
                flush: true,
                content: allQuestionsLoading
                  ? <SidebarSkeletonRows rows={6} />
                  : renderPartnerQuestionList(filteredQuestions.slice(0, 6), 'No questions match.')
              }
            ]
          : activeSection === 'highlights'
            ? [
                {
                  label: 'Working questions',
                  flush: true,
                  content: allQuestionsLoading
                    ? <SidebarSkeletonRows rows={5} />
                    : renderPartnerQuestionList(filteredQuestions.slice(0, 5), 'No questions match.')
                },
                {
                  label: 'Question context',
                  content: <RelatedConceptTags items={relatedConcepts.slice(0, 6)} />
                }
              ]
            : activeSection === 'annotations'
              ? [
                  {
                    label: 'Related highlights',
                    flush: true,
                    content: (
                      <div className="related-embed-list">
                        {relatedHighlights.length === 0 ? (
                          <CalmEmptyLine>No related highlights yet.</CalmEmptyLine>
                        ) : (
                          relatedHighlights.slice(0, 5).map((item) => (
                            <div key={item.objectId} className="related-embed-row">
                              <div>
                                <div className="related-embed-title">{item.title || 'Highlight'}</div>
                                <div className="muted small">{item.snippet || item.metadata?.articleTitle || ''}</div>
                              </div>
                              <QuietButton onClick={() => onAttachRelatedHighlight(item.objectId)}>Add</QuietButton>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  },
                  {
                    label: 'Related concepts',
                    content: <RelatedConceptTags items={relatedConcepts.slice(0, 6)} />
                  }
                ]
              : [
                  {
                    label: 'Working questions',
                    flush: true,
                    content: allQuestionsLoading
                      ? <SidebarSkeletonRows rows={6} />
                      : renderPartnerQuestionList(filteredQuestions, 'No questions match.')
                  },
                  {
                    label: 'Question context',
                    content: activeQuestion?.linkedTagName ? (
                      <div className="concept-related-tags">
                        <TagChip to={`/think?tab=concepts&concept=${encodeURIComponent(activeQuestion.linkedTagName)}`}>
                          {activeQuestion.linkedTagName}
                        </TagChip>
                      </div>
                    ) : (
                      <CalmEmptyLine>No concept linked.</CalmEmptyLine>
                    )
                  },
                  {
                    label: 'Search and status',
                    content: (
                      <>
                        <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                          <input
                            type="text"
                            value={search}
                            placeholder="Search questions"
                            onChange={(event) => onSearchChange(event.target.value)}
                          />
                        </label>
                        <label className="think-index__filter">
                          <select value={questionStatus} onChange={(event) => onQuestionStatusChange(event.target.value)}>
                            <option value="open">Open</option>
                            <option value="answered">Answered</option>
                          </select>
                        </label>
                      </>
                    )
                  },
                  {
                    label: 'Question posture',
                    content: <p>Keep the loop open until the evidence is tight enough to answer it without flattening the tension too early.</p>
                  }
                ]
      }
      footer={<button type="button" onClick={onCreateQuestion}>Feedback</button>}
    />
  );

  const mainPanel = isQuestionIndex ? (
    <CalmIndexView
      eyebrow="Think · Questions"
      orientation={indexOrientation}
      motion={indexMotion}
      loading={indexLoading}
      error={allQuestionsError}
      describeMotionNote={describeThreadMotionNote}
      onSelectThread={onCalmThreadSelect}
      motionStatusTestIdPrefix="think-question-status"
      emptyState={(
        <QuestionIndexEmptyState onCreateQuestion={onCreateQuestion} questionSaving={questionSaving} />
      )}
      actions={filteredQuestions.length > 0 ? (
        <>
          <Button variant="secondary" onClick={onCreateQuestion} disabled={questionSaving} data-testid="think-questions-index-create-button">
            New question
          </Button>
          <QuietButton onClick={onQueueOrganizationPrompt}>Clean up structure</QuietButton>
        </>
      ) : null}
    />
  ) : (
    <div className="question-editorial-main">
      {renderThinkPostureStrip('think-posture-strip--question')}
      <div className="question-editorial-main__hero">
        <div className="question-editorial-main__eyebrow">Question refinement</div>
        <p className="question-editorial-main__subtitle">
          {activeQuestionData?.linkedTagName
            ? `Open loop inside ${activeQuestionData.linkedTagName}. Clarify the question before deciding what evidence belongs.`
            : 'Clarify the question before deciding what evidence belongs.'}
        </p>
      </div>

      {questionError && <p className="status-message error-message">{questionError}</p>}

      <div className="question-editorial-main__editor">
        <div className="question-editorial-main__draft-grid">
          <div className="question-editorial-main__draft-body">
            <QuestionEditor
              question={activeQuestionData}
              saving={questionSaving}
              error={questionError}
              onSave={onSaveQuestion}
              onRegisterInsert={onRegisterQuestionInsert}
              onSynthesize={(question) => onOpenSynthesis('question', question?._id)}
              variant="editorial"
              onInvokeAgentSkill={queueThoughtPartnerPrompt}
              agentContextType={thoughtPartnerContext?.contextType || 'question'}
              agentContextId={thoughtPartnerContext?.contextId || activeQuestionData?._id || ''}
              agentContextTitle={activeQuestionData?.text || thoughtPartnerContext?.contextTitle || 'Question'}
              challengeEvidenceByBlockId={questionChallengeEvidenceByBlockId}
            />
            {activeQuestionData && questionStatus === 'open' && (
              <div className="think-question-actions">
                <QuietButton onClick={onQueueOrganizationPrompt}>Clean up structure</QuietButton>
                <QuietButton onClick={() => onMarkAnswered(activeQuestionData)}>Mark answered</QuietButton>
              </div>
            )}
          </div>
          <aside
            className="question-editorial-main__evidence-dock"
            aria-label="Question line evidence"
            data-testid="question-inline-evidence-dock"
          >
            <div className="question-editorial-main__evidence-gauge">
              <span>{questionSupportSignals.length}</span>
              <i aria-hidden="true" />
              <span>{questionCounterSignals.length}</span>
            </div>
            <ol className="question-editorial-main__evidence-lines">
              {questionEvidenceAnchors.map((anchor, index) => {
                const supportSignals = questionSignalsForLine(questionSupportSignals, anchor, index);
                const counterSignals = questionSignalsForLine(questionCounterSignals, anchor, index);
                const supportSignal = supportSignals[0] || null;
                const counterSignal = counterSignals[0] || null;
                const lineSignalTotal = supportSignals.length + counterSignals.length;
                const lineSupportLean = lineSignalTotal
                  ? Math.round((supportSignals.length / lineSignalTotal) * 100)
                  : 50;
                const lineCounterLean = lineSignalTotal ? 100 - lineSupportLean : 50;
                const confidenceLabel = getQuestionLineConfidence(supportSignals.length, counterSignals.length);
                return (
                  <li
                    key={anchor.id}
                    className="question-editorial-main__evidence-line"
                    data-testid={`question-line-evidence-${anchor.id}`}
                    data-anchor-block-id={anchor.id}
                    data-support-count={supportSignals.length}
                    data-counter-count={counterSignals.length}
                    data-support-lean={lineSupportLean}
                    data-challenge-active={anchor.challengeActive ? 'true' : 'false'}
                  >
                    <a className="question-editorial-main__line-label" href={`#question-block-${anchor.id}`}>
                      Line {index + 1}
                    </a>
                    <p>{anchor.text}</p>
                    {anchor.challengeActive ? (
                      <span className="question-editorial-main__challenge-marker">Challenge marked</span>
                    ) : null}
                    <div
                      className="question-editorial-main__line-balance"
                      aria-label={`Line ${index + 1} balance: ${supportSignals.length} support, ${counterSignals.length} counter`}
                      style={{ '--question-line-support-lean': `${lineSupportLean}%` }}
                    >
                      <span>Support {lineSupportLean}%</span>
                      <i aria-hidden="true" />
                      <span>Counter {lineCounterLean}%</span>
                    </div>
                    <span className="question-editorial-main__line-confidence">{confidenceLabel}</span>
                    <article className="question-editorial-main__evidence-card is-support" data-anchor-block-id={anchor.id}>
                      <span>Support notch</span>
                      {supportSignal ? (
                        <>
                          <strong>{supportSignal.title}</strong>
                          <p>{supportSignal.quote}</p>
                        </>
                      ) : (
                        <p>No supporting source docked yet.</p>
                      )}
                    </article>
                    <article className="question-editorial-main__evidence-card is-counter" data-anchor-block-id={anchor.id}>
                      <span>Counter notch</span>
                      {counterSignal ? (
                        <>
                          <strong>{counterSignal.title}</strong>
                          <p>{counterSignal.quote}</p>
                        </>
                      ) : (
                        <p>No counter source docked yet.</p>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );

  const rightPanel = (
    <div className="editorial-side-rail question-editorial-context">
      <ThoughtPartnerPanel
        className="editorial-side-rail__partner question-editorial-context__agent"
        variant="stream"
        contextType={thoughtPartnerContext?.contextType || 'question'}
        contextId={thoughtPartnerContext?.contextId || activeQuestionData?._id || 'question'}
        contextTitle={thoughtPartnerContext?.contextTitle || activeQuestionData?.text || 'Question'}
        contextMetadata={thoughtPartnerContextMetadata}
        queuedPrompt={queuedThoughtPartnerPrompt}
        {...thoughtPartnerPostureProps}
        title={AGENT_DISPLAY_NAME}
        subtitle="Question contextualization"
        placeholder="Ask what this question should prove, gather, or test next."
        promptTemplates={[
          'What is this question really asking?',
          'What evidence would answer this best?',
          'What concept should this question connect to?'
        ]}
        emptyStateText="Use the question rail to clarify, connect, and tighten open loops."
        submitLabel="↗"
      />
      {renderReferencePullIn('editorial-side-rail__section question-editorial-context__section')}
      <div className="editorial-side-rail__section question-editorial-context__section question-dialectic-margin">
        <SectionHeader
          title="Dialectical margin"
          subtitle="Support and counter-pressure stay beside the open loop."
        />
        <div
          className="question-dialectic-margin__gauge"
          style={{ '--question-support-lean': `${questionSupportLean}%` }}
          aria-label={`Question evidence lean: ${questionSupportSignals.length} support, ${questionCounterSignals.length} counter`}
        >
          <span>Counter</span>
          <div aria-hidden="true"><i /></div>
          <span>Support</span>
        </div>
        <div className="question-dialectic-margin__lanes">
          <section>
            <h3>Strongest support</h3>
            {questionSupportSignals.length === 0 ? (
              <CalmEmptyLine>No support staged yet.</CalmEmptyLine>
            ) : (
              questionSupportSignals.map(signal => (
                <article key={`support-${signal.id}`} className="question-dialectic-margin__card is-support">
                  <span className="question-dialectic-margin__source">{signal.sourceKind || 'Evidence'}</span>
                  <strong>{signal.title}</strong>
                  <span>{signal.quote}</span>
                  {signal.source && <em>{signal.source}</em>}
                  {signal.objectId && (
                    <button type="button" onClick={() => onAttachRelatedHighlight(signal.objectId)}>
                      Pull into question
                    </button>
                  )}
                </article>
              ))
            )}
          </section>
          <section>
            <h3>Counter-pressure</h3>
            {questionCounterSignals.length === 0 ? (
              <CalmEmptyLine>No counter-evidence staged yet.</CalmEmptyLine>
            ) : (
              questionCounterSignals.map(signal => (
                <article key={`counter-${signal.id}`} className="question-dialectic-margin__card is-counter">
                  <span className="question-dialectic-margin__source">{signal.sourceKind || 'Evidence'}</span>
                  <strong>{signal.title}</strong>
                  <span>{signal.quote}</span>
                  {signal.source && <em>{signal.source}</em>}
                  {signal.objectId && (
                    <button type="button" onClick={() => onAttachRelatedHighlight(signal.objectId)}>
                      Pull into question
                    </button>
                  )}
                </article>
              ))
            )}
          </section>
        </div>
      </div>
      {activeQuestionData?._id && (
        <div className="editorial-side-rail__section question-editorial-context__section think-wiki-promotion">
          <SectionHeader title="Graduate" subtitle="Make this open loop a durable wiki page." />
          <Button
            type="button"
            onClick={() => onPromoteThinkObjectToWiki('question')}
            disabled={wikiPromotionState.busyTarget === questionWikiPromotionTarget}
          >
            {wikiPromotionState.busyTarget === questionWikiPromotionTarget ? 'Promoting...' : 'Promote to wiki page'}
          </Button>
          {renderWikiPromotionTrace(questionWikiPromotionTarget)}
          {wikiPromotionState.error && wikiPromotionState.busyTarget !== conceptWikiPromotionTarget ? wikiPromotionError : null}
        </div>
      )}
      {questionScopedArtifactDraftsModel?.pendingCount > 0 && (
        <AgentArtifactDraftsPanel
          draftsModel={questionScopedArtifactDraftsModel}
          title="Draft queue"
          subtitle="Question-specific output waiting for review."
          emptyText="No staged drafts yet."
          className="editorial-side-rail__section think-draft-staging-panel question-editorial-context__drafts"
          onInvokeWorkflowSkill={queueThoughtPartnerPrompt}
          onOpenThreadFromDraft={onOpenThreadFromDraft}
          onCreateHandoffFromDraft={onCreateHandoffFromDraft}
          onQueueFollowUpLoop={onQueueFollowUpLoopFromDraft}
          contextType={thoughtPartnerContext?.contextType || 'question'}
          contextId={thoughtPartnerContext?.contextId || activeQuestionData?._id || 'question'}
          contextTitle={thoughtPartnerContext?.contextTitle || activeQuestionData?.text || 'Question'}
          maxPending={1}
          showPromoted={false}
          compact
        />
      )}

      <div className="editorial-side-rail__section question-editorial-context__section">
        <SectionHeader title="Question context" subtitle="What this question is attached to." />
        {activeQuestion?.linkedTagName ? (
          <TagChip to={`/think?tab=concepts&concept=${encodeURIComponent(activeQuestion.linkedTagName)}`}>
            {activeQuestion.linkedTagName}
          </TagChip>
        ) : (
          <CalmEmptyLine>No concept linked.</CalmEmptyLine>
        )}
      </div>

      <div className="editorial-side-rail__section question-editorial-context__section">
        <SectionHeader title="Connections" subtitle="Supports, contradictions, and extensions." />
        {contextConnectionsLoading && <p className="muted small">Loading connections…</p>}
        {contextConnectionsError && <p className="status-message error-message">{contextConnectionsError}</p>}
        {!contextConnectionsLoading && !contextConnectionsError && (
          <div className="context-connection-list">
            {scopedConnections.length === 0 ? (
              <CalmEmptyLine>No scoped connections yet.</CalmEmptyLine>
            ) : (
              scopedConnections.slice(0, 8).map(row => (
                <div key={row._id} className="context-connection-row">
                  <span className="context-connection-node">{row.fromItem?.title || row.fromType}</span>
                  <span className="context-connection-relation">{row.relationType}</span>
                  <span className="context-connection-node">{row.toItem?.title || row.toType}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="editorial-side-rail__section question-editorial-context__section">
        <SectionHeader title="Related highlights" subtitle="Relevant material to embed." />
        {questionRelatedLoading && <p className="muted small">Finding related highlights…</p>}
        {questionRelatedError && <p className="status-message error-message">{questionRelatedError}</p>}
        {!questionRelatedLoading && !questionRelatedError && (
          <div className="related-embed-list">
            {relatedHighlights.length === 0 ? (
              <CalmEmptyLine>No related highlights yet.</CalmEmptyLine>
            ) : (
              relatedHighlights.slice(0, 6).map(item => (
                <div key={item.objectId} className="related-embed-row">
                  <div>
                    <div className="related-embed-title">{item.title || 'Highlight'}</div>
                    <div className="muted small">{item.snippet || item.metadata?.articleTitle || ''}</div>
                  </div>
                  <QuietButton onClick={() => onAttachRelatedHighlight(item.objectId)}>Add</QuietButton>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="editorial-side-rail__section question-editorial-context__section">
        <SectionHeader title="Related concepts" subtitle="Neighboring ideas." />
        {questionRelatedLoading && <p className="muted small">Finding related concepts…</p>}
        {questionRelatedError && <p className="status-message error-message">{questionRelatedError}</p>}
        {!questionRelatedLoading && !questionRelatedError && (
          <div className="related-embed-list">
            <RelatedConceptTags items={relatedConcepts.slice(0, 8)} />
          </div>
        )}
      </div>

      {activeQuestion?._id && (
        <div className="editorial-side-rail__section question-editorial-context__section">
          <SectionHeader title="Used in" subtitle="Backlinks to this question." />
          <ReferencesPanel
            targetType="question"
            targetId={activeQuestion._id}
            label="Show backlinks"
            defaultOpen
            showToggle={false}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="question-editorial-shell-page" data-think-posture="question">
      <div className="question-editorial-shell">
        <aside className="question-editorial-shell__left">
          {isQuestionIndex && shelfRail ? shelfRail : leftPanel}
        </aside>
        <main className="question-editorial-shell__main">
          <span className="sr-only">Questions</span>
          {mainPanel}
        </main>
        <aside className="question-editorial-shell__right">
          {rightPanel}
        </aside>
      </div>
    </div>
  );
};

export default QuestionEditorialView;
