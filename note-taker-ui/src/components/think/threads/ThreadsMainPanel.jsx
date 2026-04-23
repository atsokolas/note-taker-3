import React, { useEffect, useMemo, useState } from 'react';
import ThoughtPartnerPanel from '../../agent/ThoughtPartnerPanel';
import AgentArtifactDraftsPanel from '../../agent/AgentArtifactDraftsPanel';
import ProtocolActivityTimeline from '../../agent/ProtocolActivityTimeline';
import ProtocolWorkbenchCanvas from '../../agent/ProtocolWorkbenchCanvas';
import UpkeepCyclesPanel from '../../agent/UpkeepCyclesPanel';
import { Button, QuietButton, SectionHeader, SurfaceCard } from '../../ui';

const clean = (value) => String(value || '').trim();

const splitLines = (value = '') => (
  String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
);

const joinLines = (values = []) => (
  Array.isArray(values) ? values.filter(Boolean).join('\n') : ''
);

const formatWorkerRole = (planner = null, fallback = '') => {
  const label = clean(planner?.activeWorkerLabel);
  if (label) return label;
  const role = clean(planner?.activeWorkerRole || fallback);
  return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : '';
};

const buildThreadPromptTemplates = (thread = {}) => {
  const scopeTitle = clean(thread?.scope?.title) || clean(thread?.title) || 'this thread';
  return [
    `What is the sharpest next move for ${scopeTitle}?`,
    `Summarize what is still unresolved in ${scopeTitle}.`,
    `Challenge the current plan for ${scopeTitle}.`
  ];
};

const ThreadsMainPanel = ({
  threadsModel,
  relatedApprovalsModel = null,
  hookRunsModel = null,
  draftsModel = null,
  upkeepCyclesModel = null,
  onOpenHandoff = () => {},
  onOpenThread = () => {},
  onInvokeWorkflowSkill = null,
  onOpenThreadFromDraft = null,
  onCreateHandoffFromDraft = null,
  onQueueFollowUpLoop = null
}) => {
  const {
    activeThreadData,
    threadActionBusyId,
    threadActionError,
    threadActionInfo,
    threadConvertBusyId,
    formatActor,
    formatScopeLabel,
    formatDateTime,
    handleCreateThread,
    handleConvertToHandoff,
    handleSaveCheckpoint,
    handleToggleArchive,
    hydrateThread
  } = threadsModel;
  const [checkpointSummary, setCheckpointSummary] = useState('');
  const [checkpointQuestions, setCheckpointQuestions] = useState('');
  const [checkpointActions, setCheckpointActions] = useState('');

  useEffect(() => {
    setCheckpointSummary(clean(activeThreadData?.checkpoint?.summary));
    setCheckpointQuestions(joinLines(activeThreadData?.checkpoint?.openQuestions));
    setCheckpointActions(joinLines(activeThreadData?.checkpoint?.nextActions));
  }, [activeThreadData?.checkpoint, activeThreadData?.threadId]);

  const isBusy = threadActionBusyId === String(activeThreadData?.threadId || '');
  const isConverting = threadConvertBusyId === String(activeThreadData?.threadId || '');
  const isArchived = clean(activeThreadData?.status).toLowerCase() === 'archived';
  const promptTemplates = useMemo(() => buildThreadPromptTemplates(activeThreadData), [activeThreadData]);

  const handleCheckpointSubmit = async () => {
    if (!activeThreadData?.threadId || isBusy) return;
    await handleSaveCheckpoint(activeThreadData.threadId, {
      summary: checkpointSummary,
      openQuestions: splitLines(checkpointQuestions),
      nextActions: splitLines(checkpointActions)
    });
  };

  if (!activeThreadData) {
    return (
      <div className="section-stack think-threads-main" data-testid="think-threads-main">
        <SurfaceCard className="think-threads-card think-threads-card--empty">
          <SectionHeader
            title="Shared threads"
            subtitle="Pick a thread from the rail or start a fresh one."
          />
          <p className="muted small">
            Shared threads hold the working conversation, checkpoint, and plan across native and BYO agents.
          </p>
          <div className="think-threads-empty-actions">
            <Button type="button" variant="secondary" onClick={handleCreateThread}>
              Start thread
            </Button>
          </div>
          {threadsModel.threadCreateInfo && <p className="status-message success-message">{threadsModel.threadCreateInfo}</p>}
          {threadsModel.threadCreateError && <p className="status-message error-message">{threadsModel.threadCreateError}</p>}
        </SurfaceCard>
      </div>
    );
  }

  const planSteps = Array.isArray(activeThreadData?.plan?.steps) ? activeThreadData.plan.steps : [];
  const successCriteria = Array.isArray(activeThreadData?.plan?.successCriteria) ? activeThreadData.plan.successCriteria : [];

  return (
    <>
      <ProtocolWorkbenchCanvas
      className="think-threads-main"
      hero={(
        <SurfaceCard className="think-threads-card think-threads-card--hero">
          <div className="think-threads-hero">
            <div className="think-threads-hero__copy">
              <div className="think-threads-hero__eyebrow">{formatScopeLabel(activeThreadData.scope)}</div>
              <h1 className="think-threads-hero__title">{activeThreadData.title || 'Untitled thread'}</h1>
              <p className="think-threads-hero__subtitle">
                {activeThreadData.summary || 'Shared operating context for the next move, the current plan, and the active conversation.'}
              </p>
            </div>
            <div className="think-threads-hero__actions">
              <QuietButton
                type="button"
                onClick={() => handleToggleArchive(activeThreadData.threadId, !isArchived)}
                disabled={isBusy || isConverting}
              >
                {isArchived ? 'Restore thread' : 'Archive thread'}
              </QuietButton>
              {!activeThreadData.handoffId && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    const response = await handleConvertToHandoff(activeThreadData.threadId, { autoRoute: true });
                    const nextHandoffId = String(response?.handoff?.handoffId || '').trim();
                    if (nextHandoffId) onOpenHandoff(nextHandoffId);
                  }}
                  disabled={isBusy || isConverting || isArchived}
                >
                  {isConverting ? 'Routing…' : 'Convert to handoff'}
                </Button>
              )}
              {activeThreadData.handoffId && (
                <QuietButton
                  type="button"
                  onClick={() => onOpenHandoff(activeThreadData.handoffId)}
                >
                  Open handoff
                </QuietButton>
              )}
            </div>
          </div>

          <div className="think-threads-meta">
            <div className="think-threads-meta__item">
              <span className="think-threads-meta__label">Status</span>
              <span className={`think-threads-status-pill is-${clean(activeThreadData.status).toLowerCase() || 'active'}`}>
                {clean(activeThreadData.status) || 'active'}
              </span>
            </div>
            <div className="think-threads-meta__item">
              <span className="think-threads-meta__label">Last actor</span>
              <span>{formatActor(activeThreadData.lastActor || activeThreadData.createdBy)}</span>
            </div>
            {clean(activeThreadData?.planner?.activeWorkerRole) && (
              <div className="think-threads-meta__item">
                <span className="think-threads-meta__label">Specialist</span>
                <span>{formatWorkerRole(activeThreadData.planner)}</span>
              </div>
            )}
            <div className="think-threads-meta__item">
              <span className="think-threads-meta__label">Updated</span>
              <span>{formatDateTime(activeThreadData.updatedAt) || 'Unknown'}</span>
            </div>
            <div className="think-threads-meta__item">
              <span className="think-threads-meta__label">Messages</span>
              <span>{Array.isArray(activeThreadData.messages) ? activeThreadData.messages.length : 0}</span>
            </div>
          </div>
        </SurfaceCard>
      )}
      main={(
        <div className="think-threads-workbench">
          <div className="think-threads-workbench__primary">
            <div className="think-threads-dual">
              <SurfaceCard className="think-threads-card">
                <SectionHeader
                  title="Plan"
                  subtitle="The executable shape of the thread."
                />
                {clean(activeThreadData?.planner?.rationale) && (
                  <div className="think-planner-callout">
                    <span className="think-planner-callout__eyebrow">Planner</span>
                    <p>{activeThreadData.planner.rationale}</p>
                  </div>
                )}
                <div className="think-threads-plan">
                  <div className="think-threads-plan__objective">
                    <div className="think-threads-plan__label">Objective</div>
                    <p>{clean(activeThreadData?.plan?.objective) || 'No explicit objective yet.'}</p>
                  </div>

                  {successCriteria.length > 0 && (
                    <div className="think-threads-plan__criteria">
                      <div className="think-threads-plan__label">Success criteria</div>
                      <ul className="think-threads-plan__list">
                        {successCriteria.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="think-threads-plan__steps">
                    <div className="think-threads-plan__label">Steps</div>
                    {planSteps.length === 0 ? (
                      <p className="muted small">No plan steps saved yet.</p>
                    ) : (
                      <div className="think-threads-steps">
                        {planSteps.map((step) => (
                          <div key={step.id} className={`think-threads-step is-${clean(step.status).toLowerCase() || 'pending'}`}>
                            <div className="think-threads-step__row">
                              <span className="think-threads-step__title">{step.title || 'Untitled step'}</span>
                              <span className="think-threads-step__status">{step.status || 'pending'}</span>
                            </div>
                            {(step.notes || step.actor?.actorType || step.workerRole) && (
                              <div className="think-threads-step__meta">
                                {step.actor?.actorType ? formatActor(step.actor) : ''}
                                {step.actor?.actorType && (step.notes || step.workerRole) ? ' · ' : ''}
                                {step.workerRole ? `${formatWorkerRole(null, step.workerRole)} specialist` : ''}
                                {step.workerRole && step.notes ? ' · ' : ''}
                                {step.notes || ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard className="think-threads-card">
                <SectionHeader
                  title="Checkpoint"
                  subtitle="Make the working state explicit before another actor picks it up. It also tightens automatically as the thread grows."
                  action={(
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCheckpointSubmit}
                      disabled={isBusy || isConverting}
                    >
                      {isBusy ? 'Saving…' : 'Save checkpoint'}
                    </Button>
                  )}
                />

                <div className="think-threads-checkpoint-grid">
                  <label className="feedback-field">
                    <span>Summary</span>
                    <textarea
                      rows={4}
                      value={checkpointSummary}
                      onChange={(event) => setCheckpointSummary(event.target.value)}
                      placeholder="Summarize the current state of the thread."
                    />
                  </label>
                  <label className="feedback-field">
                    <span>Open questions</span>
                    <textarea
                      rows={5}
                      value={checkpointQuestions}
                      onChange={(event) => setCheckpointQuestions(event.target.value)}
                      placeholder="One question per line"
                    />
                  </label>
                  <label className="feedback-field">
                    <span>Next actions</span>
                    <textarea
                      rows={5}
                      value={checkpointActions}
                      onChange={(event) => setCheckpointActions(event.target.value)}
                      placeholder="One action per line"
                    />
                  </label>
                </div>
              </SurfaceCard>
            </div>
          </div>

          <ThoughtPartnerPanel
            className="think-threads-card think-threads-partner think-threads-partner--main"
            contextType={activeThreadData?.scope?.type || 'global'}
            contextId={activeThreadData?.scope?.id || activeThreadData?.threadId}
            contextTitle={activeThreadData?.scope?.title || activeThreadData?.title}
            contextMetadata={{
              summary: activeThreadData?.checkpoint?.summary || activeThreadData?.summary || '',
              primaryText: activeThreadData?.plan?.objective || '',
              openQuestions: Array.isArray(activeThreadData?.checkpoint?.openQuestions) ? activeThreadData.checkpoint.openQuestions : [],
              nextActions: Array.isArray(activeThreadData?.checkpoint?.nextActions) ? activeThreadData.checkpoint.nextActions : [],
              relatedItems: Array.isArray(activeThreadData?.scope?.metadata?.relatedItems)
                ? activeThreadData.scope.metadata.relatedItems
                : []
            }}
            title="Continue thread"
            subtitle="Keep the shared timeline moving without leaving Think."
            placeholder={isArchived ? 'Restore the thread before continuing.' : 'Ask the next question or move the plan forward.'}
            promptTemplates={promptTemplates}
            emptyStateText="This thread is ready for the next question."
            submitLabel="Continue"
            variant="stream"
            thread={activeThreadData}
            onThreadChange={hydrateThread}
            disabled={isArchived}
          />
        </div>
      )}
      aside={(
        <>
          <AgentArtifactDraftsPanel
            draftsModel={draftsModel}
            title="Protocol drafts"
            subtitle="Artifacts staged from this thread stay inside the same operating canvas."
            emptyText="No drafts staged from this thread yet."
            className="think-draft-staging-panel"
            onInvokeWorkflowSkill={onInvokeWorkflowSkill}
            onOpenThreadFromDraft={onOpenThreadFromDraft}
            onCreateHandoffFromDraft={onCreateHandoffFromDraft}
            onQueueFollowUpLoop={onQueueFollowUpLoop}
            contextType={activeThreadData?.scope?.type || 'thread'}
            contextId={activeThreadData?.scope?.id || activeThreadData?.threadId}
            contextTitle={activeThreadData?.scope?.title || activeThreadData?.title || 'Thread'}
          />

          <UpkeepCyclesPanel
            upkeepCyclesModel={upkeepCyclesModel}
            title="Related upkeep loops"
            subtitle="Recurring cycles attached to this thread and its delegated runs."
            emptyText="No upkeep cycles linked to this thread yet."
            className="think-threads-card"
            threadId={activeThreadData?.threadId}
            onOpenThread={onOpenThread}
            onOpenHandoff={onOpenHandoff}
          />
        </>
      )}
      timeline={(
        <ProtocolActivityTimeline
          entityType="thread"
          thread={activeThreadData}
          approvalsModel={relatedApprovalsModel}
          hookRunsModel={hookRunsModel}
          draftsModel={draftsModel}
          upkeepCyclesModel={upkeepCyclesModel}
          onOpenThread={onOpenThread}
          onOpenHandoff={onOpenHandoff}
          onResumeUpkeep={upkeepCyclesModel?.handleResumeUpkeepCycle}
          formatActor={formatActor}
          formatDateTime={formatDateTime}
          title="Operating log"
          subtitle="Planner moves, thread work, approvals, hooks, and artifact promotions in one shared timeline."
          emptyText="No operating activity for this thread yet."
          className="think-threads-card"
        />
      )}
      />

      <div>
        {threadActionError && <p className="status-message error-message">{threadActionError}</p>}
        {threadActionInfo && <p className="status-message success-message">{threadActionInfo}</p>}
      </div>
    </>
  );
};

export default ThreadsMainPanel;
