import React from 'react';
import { Button, QuietButton, SectionHeader, SurfaceCard } from '../ui';

const clean = (value) => String(value || '').trim();

const formatDateTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
};

const UpkeepCyclesPanel = ({
  upkeepCyclesModel,
  title = 'Recurring upkeep',
  subtitle = 'Persistent maintenance cycles you can resume, pause, or complete without losing the loop.',
  emptyText = 'No upkeep cycles yet.',
  className = '',
  threadId = '',
  handoffId = '',
  onOpenThread = null,
  onOpenHandoff = null
}) => {
  const {
    upkeepCycles,
    upkeepCyclesLoading,
    upkeepCyclesError,
    upkeepCycleBusyId,
    activeCount,
    handleResumeUpkeepCycle,
    handlePauseUpkeepCycle,
    handleActivateUpkeepCycle,
    handleCompleteUpkeepCycle
  } = upkeepCyclesModel || {};

  const cleanThreadId = clean(threadId);
  const cleanHandoffId = clean(handoffId);
  const filteredCycles = Array.isArray(upkeepCycles)
    ? upkeepCycles.filter((cycle) => {
      if (!cleanThreadId && !cleanHandoffId) return true;
      const cycleThreadId = clean(cycle?.lastThreadId);
      const cycleHandoffId = clean(cycle?.lastHandoffId);
      const runs = Array.isArray(cycle?.runs) ? cycle.runs : [];
      const hasRunMatch = runs.some((run) => (
        (cleanThreadId && clean(run?.threadId) === cleanThreadId)
        || (cleanHandoffId && clean(run?.handoffId) === cleanHandoffId)
      ));
      if (hasRunMatch) return true;
      if (cleanThreadId && cycleThreadId === cleanThreadId) return true;
      if (cleanHandoffId && cycleHandoffId === cleanHandoffId) return true;
      return false;
    })
    : [];

  const contextualActiveCount = filteredCycles.filter((cycle) => clean(cycle?.status).toLowerCase() === 'active').length;

  return (
    <SurfaceCard className={className} data-testid="upkeep-cycles-panel">
      <SectionHeader
        title={title}
        subtitle={subtitle}
        action={(
          contextualActiveCount
            ? <span className="think-artifact-drafts-panel__count">{contextualActiveCount} active</span>
            : (activeCount ? <span className="think-artifact-drafts-panel__count">{activeCount} active</span> : null)
        )}
      />
      {upkeepCyclesError && <p className="status-message error-message">{upkeepCyclesError}</p>}
      {upkeepCyclesLoading ? (
        <p className="muted small">Loading upkeep cycles…</p>
      ) : filteredCycles.length === 0 ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        <div className="think-upkeep-cycles">
          {filteredCycles.map((cycle) => {
            const cycleId = clean(cycle?.cycleId);
            const busy = upkeepCycleBusyId === cycleId;
            const status = clean(cycle?.status).toLowerCase() || 'active';
            const linkedHandoffStatus = clean(cycle?.linkedHandoffStatus).toLowerCase();
            const linkedThreadId = clean(cycle?.lastThreadId);
            const linkedHandoffId = clean(cycle?.lastHandoffId);
            const workflowSteps = Array.isArray(cycle?.workflow?.steps) ? cycle.workflow.steps.filter(Boolean).slice(0, 3) : [];
            const lastOutcomeSummary = clean(cycle?.lastOutcome?.summary);
            const lastOutcomeStatus = clean(cycle?.lastOutcome?.status).toLowerCase();
            const nextDue = cycle?.nextDueAt ? new Date(cycle.nextDueAt) : null;
            const dueNow = !nextDue || !Number.isFinite(nextDue.getTime()) || nextDue.getTime() <= Date.now();
            const hasOpenRun = linkedHandoffStatus === 'pending' || linkedHandoffStatus === 'claimed';
            const requireForce = !hasOpenRun && !dueNow;

            return (
              <article key={cycleId} className={`think-upkeep-cycle think-upkeep-cycle--${status}`}>
                <div className="think-upkeep-cycle__head">
                  <div>
                    <div className="think-upkeep-cycle__eyebrow">
                      <span>{clean(cycle?.cadence).replace(/_/g, ' ') || 'recurring'}</span>
                      <span>{status}</span>
                      {clean(cycle?.workerRole) && <span>{clean(cycle.workerRole)}</span>}
                    </div>
                    <h4>{cycle?.title || 'Untitled upkeep cycle'}</h4>
                  </div>
                  {cycle?.nextDueAt && (
                    <div className="think-upkeep-cycle__due">
                      Next pass {formatDateTime(cycle.nextDueAt)}
                    </div>
                  )}
                </div>

                {cycle?.summary && <p className="think-upkeep-cycle__summary">{cycle.summary}</p>}

                {(cycle?.sourceContext?.title || linkedHandoffStatus || cycle?.lastRunAt) && (
                  <div className="think-upkeep-cycle__meta">
                    {cycle?.sourceContext?.title && <span>{cycle.sourceContext.title}</span>}
                    {linkedHandoffStatus && <span>handoff {linkedHandoffStatus}</span>}
                    {cycle?.lastRunAt && <span>last run {formatDateTime(cycle.lastRunAt)}</span>}
                  </div>
                )}
                {lastOutcomeSummary && (
                  <p className="think-upkeep-cycle__summary">
                    Last outcome{lastOutcomeStatus ? ` (${lastOutcomeStatus})` : ''}: {lastOutcomeSummary}
                  </p>
                )}

                {workflowSteps.length > 0 && (
                  <ol className="think-artifact-draft__workflow-steps">
                    {workflowSteps.map((step, index) => (
                      <li key={`${cycleId}-step-${index}`}>{step}</li>
                    ))}
                  </ol>
                )}

                <div className="think-upkeep-cycle__actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || requireForce}
                    onClick={async () => {
                      const response = await handleResumeUpkeepCycle?.(cycleId);
                      const nextHandoffId = clean(response?.handoff?.handoffId) || linkedHandoffId;
                      if (nextHandoffId && typeof onOpenHandoff === 'function') onOpenHandoff(nextHandoffId);
                    }}
                  >
                    {busy ? 'Working…' : (hasOpenRun ? 'Resume run' : 'Start next pass')}
                  </Button>
                  {requireForce && (
                    <QuietButton
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const response = await handleResumeUpkeepCycle?.(cycleId, { force: true });
                        const nextHandoffId = clean(response?.handoff?.handoffId) || linkedHandoffId;
                        if (nextHandoffId && typeof onOpenHandoff === 'function') onOpenHandoff(nextHandoffId);
                      }}
                    >
                      Run now
                    </QuietButton>
                  )}
                  {status === 'paused' ? (
                    <QuietButton type="button" disabled={busy} onClick={() => handleActivateUpkeepCycle?.(cycleId)}>
                      Activate
                    </QuietButton>
                  ) : (
                    <QuietButton type="button" disabled={busy} onClick={() => handlePauseUpkeepCycle?.(cycleId)}>
                      Pause
                    </QuietButton>
                  )}
                  <QuietButton type="button" disabled={busy} onClick={() => handleCompleteUpkeepCycle?.(cycleId)}>
                    Complete
                  </QuietButton>
                  {linkedThreadId && typeof onOpenThread === 'function' && (
                    <QuietButton type="button" disabled={busy} onClick={() => onOpenThread(linkedThreadId)}>
                      Open thread
                    </QuietButton>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </SurfaceCard>
  );
};

export default UpkeepCyclesPanel;
