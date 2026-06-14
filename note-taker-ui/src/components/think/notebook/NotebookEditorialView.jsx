import CalmIndexView, { NotebookIndexEmptyState } from '../CalmIndexView';
import { describeThreadMotionNote } from '../calmIndexModel';
import ThoughtPartnerPanel from '../../agent/ThoughtPartnerPanel';
import AgentSkillDock from '../../agent/AgentSkillDock';
import AgentArtifactDraftsPanel from '../../agent/AgentArtifactDraftsPanel';
import { Button, QuietButton, SectionHeader } from '../../ui';
import EditorialRail, { SidebarSkeletonRows } from '../EditorialRail';
import NotebookContext from './NotebookContext';
import NotebookEditor from './NotebookEditor';
import { AGENT_DISPLAY_NAME } from '../../../constants/agentIdentity';

const NotebookEditorialView = ({
  variant = 'shell',
  activeNotebookEntry,
  notebookLoadingEntry,
  notebookSaving,
  notebookEntryError,
  notebookEntries,
  filteredNotebookEntries,
  notebookEditorialSection,
  onChangeNotebookEditorialSection,
  partnerRailNavItems,
  search,
  onSearchChange,
  renderNotebookFolderList,
  renderPartnerConceptList,
  renderPartnerQuestionList,
  conceptsLoading,
  conceptsWithHighlights,
  homeWorkingSet,
  allQuestionsLoading,
  filteredQuestions,
  onSelectNotebookEntry,
  onCreateNotebookEntry,
  onSaveNotebookEntry,
  onDeleteNotebookEntry,
  onRegisterNotebookInsert,
  onOpenSynthesis,
  onDumpToWorkingMemory,
  renderThinkPostureStrip,
  queueThoughtPartnerPrompt,
  thoughtPartnerContext,
  thoughtPartnerContextMetadata,
  queuedThoughtPartnerPrompt,
  thoughtPartnerPostureProps,
  renderReferencePullIn,
  sharedArtifactDraftsModel,
  onOpenThreadFromDraft,
  onCreateHandoffFromDraft,
  onQueueFollowUpLoopFromDraft,
  onQueueOrganizationPrompt,
  onPromoteThinkObjectToWiki,
  wikiPromotionState,
  notebookWikiPromotionTarget,
  conceptWikiPromotionTarget,
  wikiPromotionError,
  renderWikiPromotionTrace,
  onSelectView,
  shelfRail = null,
  indexMotion = { inMotion: [], shelf: [] },
  indexOrientation = '',
  indexLoading = false,
  indexError = '',
  allNotebookCount = 0,
  onCalmThreadSelect = null
}) => {
  const claimCandidates = (notebookEntries || []).filter(item => (item.type || 'note') === 'claim');
  const notebookList = filteredNotebookEntries || [];
  const questions = filteredQuestions || [];
  const workingSet = homeWorkingSet || { concepts: [], questions: [] };

  const leftPanel = (
    <EditorialRail
      heroTitle={AGENT_DISPLAY_NAME}
      heroSubtitle="Contextual intelligence"
      ctaLabel={null}
      onCta={onCreateNotebookEntry}
      navItems={partnerRailNavItems}
      activeNav={notebookEditorialSection}
      onChangeNav={onChangeNotebookEditorialSection}
      sections={
        notebookEditorialSection === 'sources'
          ? [
              {
                label: 'Search and route',
                content: (
                  <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                    <input
                      type="text"
                      value={search}
                      placeholder="Search notebook pages"
                      data-testid="think-notebook-index-search-input"
                      onChange={(event) => onSearchChange(event.target.value)}
                    />
                  </label>
                )
              },
              {
                label: 'Working notebook',
                flush: true,
                content: renderNotebookFolderList(notebookList, {
                  emptyMessage: 'No notebook entries match.',
                  skeletonRows: 8
                })
              },
              {
                label: 'Open questions',
                flush: true,
                content: allQuestionsLoading
                  ? <SidebarSkeletonRows rows={4} />
                  : renderPartnerQuestionList(workingSet.questions.slice(0, 4), 'No open questions yet.')
              }
            ]
          : notebookEditorialSection === 'highlights'
            ? [
                {
                  label: 'Working notebook',
                  flush: true,
                  content: renderNotebookFolderList(notebookEntries, {
                    emptyMessage: 'No notebook entries yet.',
                    skeletonRows: 6
                  })
                },
                {
                  label: 'Concepts with evidence',
                  flush: true,
                  content: conceptsLoading
                    ? <SidebarSkeletonRows rows={4} />
                    : renderPartnerConceptList((conceptsWithHighlights || []).slice(0, 4), 'No concepts have evidence yet.')
                }
              ]
            : notebookEditorialSection === 'annotations'
              ? [
                  {
                    label: 'Question posture',
                    content: <p>Keep notebook pages loose until the structure is clear enough to promote into claims, concepts, or questions.</p>
                  },
                  {
                    label: 'Open questions',
                    flush: true,
                    content: allQuestionsLoading
                      ? <SidebarSkeletonRows rows={5} />
                      : renderPartnerQuestionList(questions.slice(0, 5), 'No questions match.')
                  }
                ]
              : [
                  {
                    label: 'Working notebook',
                    flush: true,
                    content: renderNotebookFolderList(notebookList, {
                      emptyMessage: 'No notebook entries match.',
                      skeletonRows: 8
                    })
                  },
                  {
                    label: 'Working concepts',
                    flush: true,
                    content: conceptsLoading
                      ? <SidebarSkeletonRows rows={4} />
                      : renderPartnerConceptList(workingSet.concepts.slice(0, 4), 'No concepts yet.')
                  },
                  {
                    label: 'Search and route',
                    content: (
                      <label className="feedback-field think-index__search" style={{ margin: 0 }}>
                        <input
                          type="text"
                          value={search}
                          placeholder="Search notebook pages"
                          onChange={(event) => onSearchChange(event.target.value)}
                        />
                      </label>
                    )
                  }
                ]
      }
      footer={<button type="button" onClick={onCreateNotebookEntry}>New page</button>}
    />
  );

  const mainPanel = !activeNotebookEntry ? (
    <CalmIndexView
      eyebrow="Think · Notebook"
      orientation={indexOrientation}
      motion={indexMotion}
      loading={indexLoading}
      error={indexError}
      describeMotionNote={describeThreadMotionNote}
      showPostureTag
      onSelectThread={onCalmThreadSelect}
      motionStatusTestIdPrefix="think-notebook-status"
      emptyState={(
        <NotebookIndexEmptyState onCreateNotebookEntry={onCreateNotebookEntry} />
      )}
      actions={notebookList.length > 0 ? (
        <>
          <Button variant="secondary" onClick={onCreateNotebookEntry} data-testid="think-notebook-index-create-button">
            New page
          </Button>
          <QuietButton onClick={onQueueOrganizationPrompt}>Clean up structure</QuietButton>
        </>
      ) : null}
    />
  ) : (
    <div className="think-notebook-editor-pane">
      {renderThinkPostureStrip('think-posture-strip--notebook')}
      {notebookLoadingEntry && <p className="muted small">Loading note…</p>}
      {!notebookLoadingEntry && (
        <NotebookEditor
          entry={activeNotebookEntry}
          saving={notebookSaving}
          error={notebookEntryError}
          onSave={onSaveNotebookEntry}
          onDelete={onDeleteNotebookEntry}
          onCreate={onCreateNotebookEntry}
          onRegisterInsert={onRegisterNotebookInsert}
          onSynthesize={(entry) => onOpenSynthesis('notebook', entry?._id)}
          onDump={() => onDumpToWorkingMemory()}
          claimCandidates={claimCandidates}
          onInvokeAgentSkill={queueThoughtPartnerPrompt}
          showInlineAgentDock={false}
          agentContextType={thoughtPartnerContext?.contextType || 'notebook'}
          agentContextId={thoughtPartnerContext?.contextId || activeNotebookEntry?._id || ''}
          agentContextTitle={thoughtPartnerContext?.contextTitle || activeNotebookEntry?.title || 'Notebook'}
        />
      )}
    </div>
  );

  const rightPanel = (
    <div className="editorial-side-rail notebook-editorial-context">
      <ThoughtPartnerPanel
        className="editorial-side-rail__partner"
        variant="stream"
        contextType={thoughtPartnerContext?.contextType || 'notebook'}
        contextId={thoughtPartnerContext?.contextId || activeNotebookEntry?._id || 'notebook'}
        contextTitle={thoughtPartnerContext?.contextTitle || activeNotebookEntry?.title || 'Notebook'}
        contextMetadata={thoughtPartnerContextMetadata}
        queuedPrompt={queuedThoughtPartnerPrompt}
        {...thoughtPartnerPostureProps}
        title={AGENT_DISPLAY_NAME}
        subtitle="Quiet notebook posture"
        placeholder="Ask only when you want the agent to step in."
        passiveStatusText="Quiet mode is active. Keep writing; the agent will stay ambient unless you ask it to connect, promote, or structure this page."
        promptTemplates={[
          'What matters most on this page?',
          'Which concept is forming here?',
          'What should move from notebook into concept or question?'
        ]}
        emptyStateText="Use the notebook rail to clarify what should stay loose and what should be promoted."
        submitLabel="↗"
      />
      {renderReferencePullIn('editorial-side-rail__section')}
      <details className="editorial-side-rail__section notebook-editorial-context__advanced">
        <summary>
          <span>Advanced drafting</span>
          <small>Open when this note is ready to become an output.</small>
        </summary>
        <AgentArtifactDraftsPanel
          draftsModel={sharedArtifactDraftsModel}
          title="Draft staging"
          subtitle="Promote the strongest note-driven outputs without leaving the notebook."
          emptyText="No staged drafts yet."
          accent="output"
          className="editorial-side-rail__drafts think-draft-staging-panel"
          compact
          maxPending={3}
          showPromoted={false}
          onInvokeWorkflowSkill={queueThoughtPartnerPrompt}
          onOpenThreadFromDraft={onOpenThreadFromDraft}
          onCreateHandoffFromDraft={onCreateHandoffFromDraft}
          onQueueFollowUpLoop={onQueueFollowUpLoopFromDraft}
          contextType={thoughtPartnerContext?.contextType || 'notebook'}
          contextId={thoughtPartnerContext?.contextId || activeNotebookEntry?._id || 'notebook'}
          contextTitle={thoughtPartnerContext?.contextTitle || activeNotebookEntry?.title || 'Notebook'}
        />
        <AgentSkillDock
          surface="notebook"
          contextType="notebook"
          category="output"
          contextId={activeNotebookEntry?._id || 'notebook'}
          targetContextType={thoughtPartnerContext?.contextType || 'notebook'}
          targetContextId={thoughtPartnerContext?.contextId || activeNotebookEntry?._id || ''}
          contextTitle={thoughtPartnerContext?.contextTitle || activeNotebookEntry?.title || 'Notebook'}
          title="Output studio"
          subtitle="Spin active notes into briefs, synthesis docs, and deck-ready outlines."
          className="agent-skill-dock--output"
          maxVisible={4}
          onInvoke={queueThoughtPartnerPrompt}
        />
      </details>

      <div className="editorial-side-rail__section">
        <SectionHeader title="Notebook posture" subtitle="How to use this page." />
        <p className="muted small">
          Keep the page exploratory. Promote only when a note has enough shape to become a concept, question, or draft.
        </p>
        <div className="think-home-rail__actions">
          <QuietButton onClick={onCreateNotebookEntry}>New page</QuietButton>
          <QuietButton onClick={onQueueOrganizationPrompt}>Clean up structure</QuietButton>
          <QuietButton
            onClick={() => onPromoteThinkObjectToWiki('notebook')}
            disabled={!activeNotebookEntry?._id || wikiPromotionState.busyTarget === notebookWikiPromotionTarget}
          >
            {wikiPromotionState.busyTarget === notebookWikiPromotionTarget ? 'Promoting...' : 'Promote to wiki'}
          </QuietButton>
          <QuietButton onClick={() => onSelectView('concepts')}>Open concepts</QuietButton>
        </div>
        {wikiPromotionState.error && wikiPromotionState.busyTarget !== conceptWikiPromotionTarget ? wikiPromotionError : null}
        {renderWikiPromotionTrace(notebookWikiPromotionTarget)}
      </div>

      <NotebookContext entry={activeNotebookEntry} />
    </div>
  );

  if (variant === 'left') return !activeNotebookEntry && shelfRail ? shelfRail : leftPanel;
  if (variant === 'main') return mainPanel;
  if (variant === 'right') return rightPanel;

  return (
    <div className="notebook-editorial-shell-page" data-think-posture="notebook">
      <div className="notebook-editorial-shell">
        <aside className="notebook-editorial-shell__left">
          {!activeNotebookEntry && shelfRail ? shelfRail : leftPanel}
        </aside>
        <main className="notebook-editorial-shell__main">
          {mainPanel}
        </main>
        <aside className="notebook-editorial-shell__right">
          {rightPanel}
        </aside>
      </div>
    </div>
  );
};

export default NotebookEditorialView;
