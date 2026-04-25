import React, { useMemo } from 'react';
import { QuietButton, SectionHeader, SurfaceCard } from '../ui';

const clean = (value) => String(value || '').trim();
const truncate = (value = '', limit = 260) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const formatWorkerRole = (planner = null, fallback = '') => {
  const label = clean(planner?.activeWorkerLabel);
  if (label) return label;
  const role = clean(planner?.activeWorkerRole || fallback);
  return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : '';
};

const toTimestamp = (...values) => {
  for (const value of values) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }
  return 0;
};

const humanize = (value = '') => clean(value)
  .replace(/[._-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const approvalLifecycleLabel = (approval = {}) => {
  const status = clean(approval?.status).toLowerCase() || 'pending';
  const op = humanize(approval?.op || 'protocol action');
  if (status === 'pending') return `${op} queued for review`;
  if (status === 'approved') return `${op} approved`;
  if (status === 'executed') return `${op} executed`;
  if (status === 'rejected') return `${op} rejected`;
  return `${op} ${status}`;
};

const buildApprovalMeta = (approval = {}) => {
  const result = approval?.result && typeof approval.result === 'object' ? approval.result : {};
  const preview = approval?.preview && typeof approval.preview === 'object' ? approval.preview : {};
  const meta = [
    approval?.requestedBy?.actorType ? `requested by ${approval.requestedBy.actorType}` : '',
    approval?.approvedBy?.actorType ? `approved by ${approval.approvedBy.actorType}` : '',
    approval?.rejectedBy?.actorType ? `rejected by ${approval.rejectedBy.actorType}` : '',
    preview.threadId ? `thread ${preview.threadId}` : '',
    preview.handoffId ? `handoff ${preview.handoffId}` : ''
  ];
  if (Number(preview.itemCount || 0) > 0) meta.push(`${Number(preview.itemCount)} proposed items`);
  if (Number(result.createdCount || 0) > 0) meta.push(`${Number(result.createdCount)} committed`);
  if (Number(result.skippedExistingCount || 0) > 0) meta.push(`${Number(result.skippedExistingCount)} skipped duplicate`);
  return meta.filter(Boolean);
};

const buildApprovalBody = (approval = {}) => {
  const preview = approval?.preview && typeof approval.preview === 'object' ? approval.preview : {};
  const snippets = Array.isArray(preview.snippets) ? preview.snippets.map(clean).filter(Boolean) : [];
  const decisionNote = clean(approval?.decisionNote);
  const pieces = [
    decisionNote ? `Decision note: ${decisionNote}` : '',
    clean(approval?.reason),
    snippets.length > 0 ? snippets.slice(0, 3).join(' ') : '',
    clean(preview.title)
  ].filter(Boolean);
  return truncate(pieces.join(' '), 260);
};

const buildDraftEntries = ({
  drafts = [],
  formatDateTime = () => ''
} = {}) => (
  (Array.isArray(drafts) ? drafts : [])
    .map((draft) => {
      const status = clean(draft?.status).toLowerCase() || 'pending';
      const promotedLabel = clean(draft?.promotedTo?.title) || clean(draft?.promotedTo?.type);
      const title = status === 'promoted'
        ? `Promoted ${clean(draft?.title) || 'draft'}${promotedLabel ? ` into ${promotedLabel}` : ''}`
        : status === 'dismissed'
          ? `Dismissed ${clean(draft?.title) || 'draft'}`
          : `Staged ${clean(draft?.title) || 'draft'}`;
      return {
        id: `draft-${clean(draft?.draftId)}`,
        category: 'draft',
        title,
        body: clean(draft?.summary) || truncate(draft?.body || '', 180),
        meta: [
          clean(draft?.skill?.title),
          clean(draft?.skill?.outputType).replace(/_/g, ' ')
        ].filter(Boolean),
        timestamp: toTimestamp(draft?.updatedAt, draft?.createdAt),
        timestampLabel: draft?.updatedAt ? formatDateTime(draft.updatedAt) : '',
        state: status
      };
    })
);

const buildApprovalEntries = ({
  approvals = [],
  formatDateTime = () => ''
} = {}) => (
  (Array.isArray(approvals) ? approvals : []).map((approval) => {
    const status = clean(approval?.status).toLowerCase() || 'pending';
    const timestamp = toTimestamp(
      approval?.executedAt,
      approval?.approvedAt,
      approval?.rejectedAt,
      approval?.createdAt
    );
    return {
      id: `approval-${clean(approval?.approvalId)}`,
      category: 'approval',
      title: approvalLifecycleLabel(approval),
      body: buildApprovalBody(approval),
      meta: buildApprovalMeta(approval),
      timestamp,
      timestampLabel: timestamp ? formatDateTime(timestamp) : '',
      state: status
    };
  })
);

const buildHookEntries = ({
  hookRuns = [],
  formatDateTime = () => ''
} = {}) => (
  (Array.isArray(hookRuns) ? hookRuns : []).map((run) => ({
    id: `hook-${clean(run?.hookRunId)}`,
    category: 'hook',
    title: `${humanize(run?.phase || 'hook phase')} · ${humanize(run?.op || 'protocol op')}`,
    body: clean(run?.warningMessage) || clean(run?.errorMessage) || clean(run?.preview?.title),
    meta: [
      clean(run?.source),
      clean(run?.actor?.actorType),
      clean(run?.effect),
      clean(run?.status)
    ].filter(Boolean),
    timestamp: toTimestamp(run?.createdAt),
    timestampLabel: run?.createdAt ? formatDateTime(run.createdAt) : '',
    state: clean(run?.effect).toLowerCase() || 'observe'
  }))
);

const buildUpkeepEntries = ({
  entityType = 'thread',
  thread = null,
  handoff = null,
  upkeepCycles = [],
  formatDateTime = () => '',
  onOpenThread = null,
  onOpenHandoff = null,
  onResumeUpkeep = null
} = {}) => {
  const threadId = clean(thread?.threadId);
  const handoffId = clean(handoff?.handoffId);
  const matchesEntity = (cycle = {}) => {
    if (entityType === 'handoff') {
      if (handoffId && clean(cycle?.lastHandoffId) === handoffId) return true;
      return Array.isArray(cycle?.runs) && cycle.runs.some((run) => clean(run?.handoffId) === handoffId);
    }
    if (threadId && clean(cycle?.lastThreadId) === threadId) return true;
    return Array.isArray(cycle?.runs) && cycle.runs.some((run) => clean(run?.threadId) === threadId);
  };

  return (Array.isArray(upkeepCycles) ? upkeepCycles : [])
    .filter(matchesEntity)
    .slice(0, 8)
    .map((cycle) => {
      const status = clean(cycle?.status).toLowerCase() || 'active';
      const cadence = clean(cycle?.cadence).replace(/_/g, ' ') || 'recurring';
      const nextDue = formatDateTime(cycle?.nextDueAt);
      const summary = clean(cycle?.lastOutcome?.summary) || clean(cycle?.summary);
      const cycleId = clean(cycle?.cycleId);
      const linkedThreadId = clean(cycle?.lastThreadId);
      const linkedHandoffId = clean(cycle?.lastHandoffId);
      const linkedHandoffStatus = clean(cycle?.linkedHandoffStatus).toLowerCase();
      const nextDueAt = cycle?.nextDueAt ? new Date(cycle.nextDueAt) : null;
      const dueNow = !nextDueAt || !Number.isFinite(nextDueAt.getTime()) || nextDueAt.getTime() <= Date.now();
      const hasOpenRun = linkedHandoffStatus === 'pending' || linkedHandoffStatus === 'claimed';
      const actions = [];
      if (linkedThreadId && typeof onOpenThread === 'function') {
        actions.push({
          label: 'Open thread',
          onClick: () => onOpenThread(linkedThreadId)
        });
      }
      if (linkedHandoffId && typeof onOpenHandoff === 'function') {
        actions.push({
          label: 'Open handoff',
          onClick: () => onOpenHandoff(linkedHandoffId)
        });
      }
      if (cycleId && typeof onResumeUpkeep === 'function') {
        actions.push({
          label: hasOpenRun ? 'Resume run' : (dueNow ? 'Start next pass' : 'Run now'),
          onClick: () => onResumeUpkeep(cycleId, { force: !hasOpenRun && !dueNow })
        });
      }
      return {
        id: `upkeep-${clean(cycle?.cycleId)}`,
        category: 'upkeep',
        title: `${clean(cycle?.title) || 'Upkeep cycle'} · ${status}`,
        body: summary ? truncate(summary, 220) : '',
        meta: [
          cadence,
          nextDue ? `next pass ${nextDue}` : '',
          clean(cycle?.lastOutcome?.status) ? `last outcome ${clean(cycle.lastOutcome.status)}` : ''
        ].filter(Boolean),
        timestamp: toTimestamp(cycle?.lastRunAt, cycle?.updatedAt, cycle?.nextDueAt),
        timestampLabel: cycle?.lastRunAt ? formatDateTime(cycle.lastRunAt) : '',
        state: status,
        actions
      };
    });
};

const buildThreadEntries = ({
  thread = null,
  approvals = [],
  hookRuns = [],
  drafts = [],
  upkeepCycles = [],
  formatDateTime = () => '',
  onOpenThread = null,
  onOpenHandoff = null,
  onResumeUpkeep = null
} = {}) => {
  if (!thread) return [];
  const entries = [];

  if (clean(thread?.planner?.rationale)) {
    entries.push({
      id: `thread-planner-${clean(thread?.threadId)}`,
      category: 'planner',
      title: `Planner aligned the thread around ${formatWorkerRole(thread.planner) || 'the next move'}`,
      body: clean(thread.planner.rationale),
      meta: [
        clean(thread?.planner?.routingMode),
        clean(thread?.planner?.selectedByoAgent?.name)
      ].filter(Boolean),
      timestamp: toTimestamp(thread?.updatedAt),
      timestampLabel: thread?.updatedAt ? formatDateTime(thread.updatedAt) : '',
      state: clean(thread?.planner?.activeWorkerRole).toLowerCase() || 'planner'
    });
  }

  if (clean(thread?.checkpoint?.summary) || (Array.isArray(thread?.checkpoint?.nextActions) && thread.checkpoint.nextActions.length > 0)) {
    entries.push({
      id: `thread-checkpoint-${clean(thread?.threadId)}`,
      category: 'checkpoint',
      title: 'Checkpoint refreshed',
      body: clean(thread?.checkpoint?.summary)
        || truncate((thread?.checkpoint?.nextActions || []).join(' '), 180),
      meta: [
        Array.isArray(thread?.checkpoint?.openQuestions) ? `${thread.checkpoint.openQuestions.length} open questions` : '',
        Array.isArray(thread?.checkpoint?.nextActions) ? `${thread.checkpoint.nextActions.length} next actions` : ''
      ].filter(Boolean),
      timestamp: toTimestamp(thread?.updatedAt),
      timestampLabel: thread?.updatedAt ? formatDateTime(thread.updatedAt) : '',
      state: 'checkpoint'
    });
  }

  (Array.isArray(thread?.messages) ? thread.messages : []).forEach((message, index) => {
    const role = clean(message?.role).toLowerCase() === 'assistant' ? 'assistant' : 'user';
    entries.push({
      id: `thread-message-${clean(thread?.threadId)}-${clean(message?.createdAt) || index}`,
      category: role === 'assistant' ? 'assistant' : 'user',
      title: role === 'assistant' ? 'Thought Partner advanced the thread' : 'User moved the thread forward',
      body: truncate(message?.text || '', 220),
      meta: [
        Array.isArray(message?.relatedItems) && message.relatedItems.length > 0 ? `${message.relatedItems.length} related items` : '',
        clean(message?.metadata?.planner?.activeWorkerLabel)
      ].filter(Boolean),
      timestamp: toTimestamp(message?.createdAt),
      timestampLabel: message?.createdAt ? formatDateTime(message.createdAt) : '',
      state: role
    });
  });

  return [
    ...entries,
    ...buildDraftEntries({ drafts, formatDateTime }),
    ...buildApprovalEntries({ approvals, formatDateTime }),
    ...buildHookEntries({ hookRuns, formatDateTime }),
    ...buildUpkeepEntries({
      entityType: 'thread',
      thread,
      upkeepCycles,
      formatDateTime,
      onOpenThread,
      onOpenHandoff,
      onResumeUpkeep
    })
  ];
};

const buildHandoffEntries = ({
  handoff = null,
  approvals = [],
  hookRuns = [],
  drafts = [],
  upkeepCycles = [],
  formatActor = () => 'Unknown actor',
  formatDateTime = () => '',
  onOpenThread = null,
  onOpenHandoff = null,
  onResumeUpkeep = null
} = {}) => {
  if (!handoff) return [];
  const entries = [];

  if (clean(handoff?.planner?.rationale)) {
    entries.push({
      id: `handoff-planner-${clean(handoff?.handoffId)}`,
      category: 'planner',
      title: `Planner routed this handoff to ${formatActor(handoff?.requestedActor)}`,
      body: clean(handoff.planner.rationale),
      meta: [
        formatWorkerRole(handoff.planner),
        clean(handoff?.planner?.selectedByoAgent?.name)
      ].filter(Boolean),
      timestamp: toTimestamp(handoff?.updatedAt, handoff?.createdAt),
      timestampLabel: handoff?.updatedAt ? formatDateTime(handoff.updatedAt) : '',
      state: clean(handoff?.planner?.activeWorkerRole).toLowerCase() || 'planner'
    });
  }

  (Array.isArray(handoff?.events) ? handoff.events : []).forEach((event, index) => {
    entries.push({
      id: `handoff-event-${clean(handoff?.handoffId)}-${clean(event?.createdAt) || index}`,
      category: 'handoff',
      title: `${humanize(event?.eventType || 'event')} · ${formatActor(event?.actor)}`,
      body: clean(event?.note) || clean(event?.payload?.title) || '',
      meta: [
        clean(event?.payload?.requestedActor?.actorType),
        clean(event?.payload?.planner?.activeWorkerLabel)
      ].filter(Boolean),
      timestamp: toTimestamp(event?.createdAt),
      timestampLabel: event?.createdAt ? formatDateTime(event.createdAt) : '',
      state: clean(event?.eventType).toLowerCase() || 'handoff'
    });
  });

  return [
    ...entries,
    ...buildDraftEntries({ drafts, formatDateTime }),
    ...buildApprovalEntries({ approvals, formatDateTime }),
    ...buildHookEntries({ hookRuns, formatDateTime }),
    ...buildUpkeepEntries({
      entityType: 'handoff',
      handoff,
      upkeepCycles,
      formatDateTime,
      onOpenThread,
      onOpenHandoff,
      onResumeUpkeep
    })
  ];
};

const ProtocolActivityTimeline = ({
  entityType = 'thread',
  thread = null,
  handoff = null,
  approvalsModel = null,
  hookRunsModel = null,
  draftsModel = null,
  upkeepCyclesModel = null,
  onOpenThread = null,
  onOpenHandoff = null,
  onResumeUpkeep = null,
  formatActor = () => 'Unknown actor',
  formatDateTime = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
  },
  title = 'Operating log',
  subtitle = 'Planner moves, approvals, hooks, drafts, and live work in one timeline.',
  emptyText = 'No protocol activity yet.',
  className = ''
}) => {
  const loading = Boolean(approvalsModel?.protocolApprovalsLoading || hookRunsModel?.hookRunsLoading || draftsModel?.artifactDraftsLoading);
  const error = approvalsModel?.protocolApprovalsError || hookRunsModel?.hookRunsError || draftsModel?.artifactDraftsError || '';

  const entries = useMemo(() => {
    const approvals = Array.isArray(approvalsModel?.protocolApprovals) ? approvalsModel.protocolApprovals : [];
    const hookRuns = Array.isArray(hookRunsModel?.hookRuns) ? hookRunsModel.hookRuns : [];
    const drafts = Array.isArray(draftsModel?.artifactDrafts) ? draftsModel.artifactDrafts : [];
    const upkeepCycles = Array.isArray(upkeepCyclesModel?.upkeepCycles) ? upkeepCyclesModel.upkeepCycles : [];
    const built = entityType === 'handoff'
      ? buildHandoffEntries({
        handoff,
        approvals,
        hookRuns,
        drafts,
        upkeepCycles,
        formatActor,
        formatDateTime,
        onOpenThread,
        onOpenHandoff,
        onResumeUpkeep
      })
      : buildThreadEntries({
        thread,
        approvals,
        hookRuns,
        drafts,
        upkeepCycles,
        formatDateTime,
        onOpenThread,
        onOpenHandoff,
        onResumeUpkeep
      });
    return built
      .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))
      .slice(0, 18);
  }, [approvalsModel?.protocolApprovals, draftsModel?.artifactDrafts, entityType, formatActor, formatDateTime, handoff, hookRunsModel?.hookRuns, onOpenHandoff, onOpenThread, onResumeUpkeep, thread, upkeepCyclesModel?.upkeepCycles]);

  return (
    <SurfaceCard className={className}>
      <SectionHeader title={title} subtitle={subtitle} />
      {error && <p className="status-message error-message">{error}</p>}
      {loading ? (
        <p className="muted small">Loading operating log…</p>
      ) : entries.length === 0 ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        <div className="protocol-activity-log">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className={`protocol-activity-log__item is-${clean(entry.category).toLowerCase() || 'entry'} is-state-${clean(entry.state).toLowerCase().replace(/\s+/g, '-') || 'default'}`}
            >
              <div className="protocol-activity-log__rail">
                <span className="protocol-activity-log__dot" />
              </div>
              <div className="protocol-activity-log__body">
                <div className="protocol-activity-log__eyebrow">
                  <span>{humanize(entry.category || 'activity')}</span>
                  {entry.timestampLabel && <span>{entry.timestampLabel}</span>}
                </div>
                <h4>{entry.title}</h4>
                {entry.body && <p>{entry.body}</p>}
                {Array.isArray(entry.meta) && entry.meta.length > 0 && (
                  <div className="protocol-activity-log__meta">
                    {entry.meta.map((item, index) => (
                      <span key={`${entry.id}-meta-${index}`}>{item}</span>
                    ))}
                  </div>
                )}
                {Array.isArray(entry.actions) && entry.actions.length > 0 && (
                  <div className="protocol-activity-log__actions">
                    {entry.actions.map((action, index) => (
                      <QuietButton
                        key={`${entry.id}-action-${index}`}
                        type="button"
                        onClick={action.onClick}
                      >
                        {action.label}
                      </QuietButton>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
};

export default ProtocolActivityTimeline;
