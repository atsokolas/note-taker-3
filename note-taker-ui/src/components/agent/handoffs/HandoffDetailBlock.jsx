import React from 'react';
import { SectionHeader, SurfaceCard } from '../../ui';
import AgentArtifactDraftsPanel from '../AgentArtifactDraftsPanel';
import HandoffActionButtons from './HandoffActionButtons';
import ProtocolActivityTimeline from '../ProtocolActivityTimeline';
import ProtocolWorkbenchCanvas from '../ProtocolWorkbenchCanvas';
import UpkeepCyclesPanel from '../UpkeepCyclesPanel';

const clean = (value) => String(value || '').trim();
const formatWorkerRole = (planner = null, fallback = '') => {
  const label = clean(planner?.activeWorkerLabel);
  if (label) return label;
  const role = clean(planner?.activeWorkerRole || fallback);
  return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : '';
};

const HandoffDetailBlock = ({
  handoff = null,
  formatActor = () => 'Unknown actor',
  formatDateTime = () => '',
  busy = false,
  onClaim = null,
  onComplete = null,
  onReject = null,
  onCancel = null,
  onContinueThread = null,
  showEvents = false,
  eventsTitle = 'Recent events',
  eventsSubtitle = 'Latest protocol transitions.',
  variant = 'integrations',
  actionClassName = 'settings-import-row',
  actionStyle = undefined,
  relatedApprovalsModel = null,
  hookRunsModel = null,
  draftsModel = null,
  upkeepCyclesModel = null,
  onInvokeWorkflowSkill = null,
  onOpenThreadFromDraft = null,
  onCreateHandoffFromDraft = null,
  onQueueFollowUpLoop = null,
  onOpenThread = null,
  onOpenHandoff = null,
  className = ''
}) => {
  if (!handoff) return null;

  const planSteps = Array.isArray(handoff.plan?.steps) ? handoff.plan.steps : [];
  const successCriteria = Array.isArray(handoff.plan?.successCriteria) ? handoff.plan.successCriteria : [];

  if (variant !== 'think') {
    return (
      <div className={className}>
        <p><strong>{handoff.title || 'Untitled handoff'}</strong> · {handoff.status} · {handoff.taskType} · {handoff.priority}</p>
        {handoff.objective && <p className="muted">{handoff.objective}</p>}
        {clean(handoff?.planner?.rationale) && (
          <p className="muted">
            Planner: {handoff.planner.rationale}
          </p>
        )}
        {handoff.checkpoint?.summary && (
          <p className="muted">
            Checkpoint: {handoff.checkpoint.summary}
          </p>
        )}
        <p>Requested: {formatActor(handoff.requestedActor)}</p>
        {clean(handoff?.planner?.activeWorkerRole) && (
          <p>Specialist: {formatWorkerRole(handoff.planner)}</p>
        )}
        {handoff.claimedBy && <p>Claimed by: {formatActor(handoff.claimedBy)}</p>}
        {handoff.completedBy && <p>Completed by: {formatActor(handoff.completedBy)}</p>}
        {handoff.dueAt && <p>Due: {formatDateTime(handoff.dueAt)}</p>}

        <HandoffActionButtons
          className={actionClassName}
          style={actionStyle}
          busy={busy}
          onContinueThread={onContinueThread}
          onClaim={onClaim}
          onComplete={onComplete}
          onReject={onReject}
          onCancel={onCancel}
        />

        {showEvents && (
          <div>
            {eventsTitle && <p className="muted-label">{eventsTitle}</p>}
            {eventsSubtitle && <p className="muted small">{eventsSubtitle}</p>}
            {Array.isArray(handoff.events) && handoff.events.length > 0 ? (
              <div className="think-handoffs-events">
                {[...handoff.events]
                  .slice(-8)
                  .reverse()
                  .map((event, index) => (
                    <div key={`${event.eventType}-${event.createdAt || index}`} className="think-handoffs-events__row">
                      <div className="muted small">
                        {event.eventType} · {formatActor(event.actor)}
                      </div>
                      {event.note && <div>{event.note}</div>}
                      {event.createdAt && <div className="muted small">{formatDateTime(event.createdAt)}</div>}
                    </div>
                  ))}
              </div>
            ) : (
              <p className="muted small">No events yet.</p>
            )}
          </div>
        )}

        <ProtocolActivityTimeline
          entityType="handoff"
          handoff={handoff}
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
          subtitle="Routing, claims, approvals, hooks, drafts, and completion read as one protocol narrative."
          emptyText="No operating activity for this handoff yet."
        />
      </div>
    );
  }

  return (
    <ProtocolWorkbenchCanvas
      className={className}
      hero={(
        <SurfaceCard className="think-threads-card think-threads-card--hero">
          <div className="think-threads-hero">
            <div className="think-threads-hero__copy">
              <div className="think-threads-hero__eyebrow">
                Handoff protocol · {handoff.taskType || 'custom'} · {handoff.priority || 'normal'}
              </div>
              <h1 className="think-threads-hero__title">{handoff.title || 'Untitled handoff'}</h1>
              <p className="think-threads-hero__subtitle">
                {handoff.objective || 'Delegate the next pass, keep the planner visible, and preserve the execution state.'}
              </p>
            </div>
          </div>

          <div className="think-threads-meta">
            <div className="think-threads-meta__item">
              <span className="think-threads-meta__label">Status</span>
              <span className={`think-threads-status-pill is-${clean(handoff.status).toLowerCase() || 'pending'}`}>
                {clean(handoff.status) || 'pending'}
              </span>
            </div>
            <div className="think-threads-meta__item">
              <span className="think-threads-meta__label">Requested actor</span>
              <span>{formatActor(handoff.requestedActor)}</span>
            </div>
            {clean(handoff?.planner?.activeWorkerRole) && (
              <div className="think-threads-meta__item">
                <span className="think-threads-meta__label">Specialist</span>
                <span>{formatWorkerRole(handoff.planner)}</span>
              </div>
            )}
            <div className="think-threads-meta__item">
              <span className="think-threads-meta__label">Updated</span>
              <span>{formatDateTime(handoff.updatedAt) || 'Unknown'}</span>
            </div>
            <div className="think-threads-meta__item">
              <span className="think-threads-meta__label">Due</span>
              <span>{handoff.dueAt ? formatDateTime(handoff.dueAt) : 'Not scheduled'}</span>
            </div>
          </div>
        </SurfaceCard>
      )}
      main={(
        <div className="think-threads-dual">
          <SurfaceCard className="think-threads-card">
            <SectionHeader
              title="Execution state"
              subtitle="The current delegation posture, checkpoint, and who owns the next move."
            />
            {clean(handoff?.planner?.rationale) && (
              <div className="think-planner-callout">
                <span className="think-planner-callout__eyebrow">Planner</span>
                <p>{handoff.planner.rationale}</p>
              </div>
            )}
            <div className="think-handoffs-state-grid">
              <div className="think-handoffs-state-item">
                <span className="think-threads-plan__label">Checkpoint</span>
                <p>{clean(handoff?.checkpoint?.summary) || 'No checkpoint summary yet.'}</p>
              </div>
              <div className="think-handoffs-state-item">
                <span className="think-threads-plan__label">Claimed by</span>
                <p>{handoff.claimedBy ? formatActor(handoff.claimedBy) : 'Unclaimed'}</p>
              </div>
              <div className="think-handoffs-state-item">
                <span className="think-threads-plan__label">Completed by</span>
                <p>{handoff.completedBy ? formatActor(handoff.completedBy) : 'Not completed'}</p>
              </div>
            </div>

            <HandoffActionButtons
              className="think-handoffs-detail-actions"
              style={actionStyle}
              busy={busy}
              onContinueThread={onContinueThread}
              onClaim={onClaim}
              onComplete={onComplete}
              onReject={onReject}
              onCancel={onCancel}
            />
          </SurfaceCard>

          <SurfaceCard className="think-threads-card">
            <SectionHeader
              title="Plan"
              subtitle="The executable sequence for this delegated pass."
            />
            <div className="think-threads-plan">
              <div className="think-threads-plan__objective">
                <div className="think-threads-plan__label">Objective</div>
                <p>{clean(handoff.objective) || 'No explicit objective yet.'}</p>
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
                        {(step.notes || step.workerRole) && (
                          <div className="think-threads-step__meta">
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

              {showEvents && (
                <div className="think-handoffs-events-block">
                  {eventsTitle && <div className="think-threads-plan__label">{eventsTitle}</div>}
                  {eventsSubtitle && <p className="muted small">{eventsSubtitle}</p>}
                  {Array.isArray(handoff.events) && handoff.events.length > 0 ? (
                    <div className="think-handoffs-events">
                      {[...handoff.events]
                        .slice(-5)
                        .reverse()
                        .map((event, index) => (
                          <div key={`${event.eventType}-${event.createdAt || index}`} className="think-handoffs-events__row">
                            <div className="muted small">
                              {event.eventType} · {formatActor(event.actor)}
                            </div>
                            {event.note && <div>{event.note}</div>}
                            {event.createdAt && <div className="muted small">{formatDateTime(event.createdAt)}</div>}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="muted small">No events yet.</p>
                  )}
                </div>
              )}
            </div>
          </SurfaceCard>
        </div>
      )}
      aside={(
        <>
          <SurfaceCard className="think-threads-card">
            <SectionHeader
              title="Linked thread"
              subtitle="Keep the delegated pass connected to the living conversation."
            />
            <p className="muted small">
              Continue this handoff in its shared thread when you want to shift from delegation state back into active reasoning.
            </p>
            <HandoffActionButtons
              className="think-handoffs-detail-actions"
              busy={busy}
              onContinueThread={onContinueThread}
              continueThreadLabel="Open working thread"
            />
          </SurfaceCard>

          <AgentArtifactDraftsPanel
            draftsModel={draftsModel}
            title="Protocol drafts"
            subtitle="Artifacts created from this delegated pass stay inside the same work canvas."
            emptyText="No drafts staged from this handoff yet."
            className="think-draft-staging-panel"
            onInvokeWorkflowSkill={onInvokeWorkflowSkill}
            onOpenThreadFromDraft={onOpenThreadFromDraft}
            onCreateHandoffFromDraft={onCreateHandoffFromDraft}
            onQueueFollowUpLoop={onQueueFollowUpLoop}
            contextType="handoff"
            contextId={handoff.handoffId || handoff.threadId || ''}
            contextTitle={handoff.title || 'Handoff'}
          />

          <UpkeepCyclesPanel
            upkeepCyclesModel={upkeepCyclesModel}
            title="Related upkeep loops"
            subtitle="Recurring cycles connected to this handoff and its thread."
            emptyText="No upkeep cycles linked to this handoff yet."
            className="think-threads-card"
            threadId={handoff.threadId}
            handoffId={handoff.handoffId}
            onOpenThread={onOpenThread}
            onOpenHandoff={onOpenHandoff}
          />
        </>
      )}
      timeline={(
        <ProtocolActivityTimeline
          entityType="handoff"
          handoff={handoff}
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
          subtitle="Routing, claims, approvals, hooks, drafts, and completion read as one protocol narrative."
          emptyText="No operating activity for this handoff yet."
        />
      )}
    />
  );
};

export default HandoffDetailBlock;
