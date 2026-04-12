import React, { useEffect, useMemo, useState } from 'react';
import { Button, SectionHeader, SurfaceCard } from '../ui';
import { buildQueuedAgentSkillPrompt } from '../../utils/agentSkillInvocation';

const clean = (value) => String(value || '').trim();
const formatOutputLabel = (outputType = '', artifactType = '') => {
  const safeOutput = clean(outputType).toLowerCase();
  if (safeOutput === 'research_brief_draft') return 'research brief';
  if (safeOutput === 'synthesis_doc_draft') return 'synthesis doc';
  if (safeOutput === 'slide_outline_draft') return 'slide outline';
  if (safeOutput) return safeOutput.replace(/_/g, ' ');
  return clean(artifactType) || 'draft';
};
const formatWorkerRole = (value = '') => {
  const safe = clean(value);
  if (!safe) return '';
  return safe.charAt(0).toUpperCase() + safe.slice(1);
};
const formatWorkflowTrack = (workflow = null) => {
  const safeTrack = clean(workflow?.track);
  if (!safeTrack) return '';
  return safeTrack === 'maintenance'
    ? (workflow?.loop ? 'Maintenance loop' : 'Maintenance flow')
    : (workflow?.loop ? 'Output loop' : 'Output flow');
};
const formatWorkflowCadence = (workflow = null) => {
  const safeCadence = clean(workflow?.cadence);
  if (!safeCadence) return '';
  return safeCadence.replace(/_/g, ' ');
};

const ArtifactDraftEditor = ({
  draft,
  busy = false,
  onSave = null,
  onCancel = null
}) => {
  const [title, setTitle] = useState(clean(draft?.title));
  const [summary, setSummary] = useState(clean(draft?.summary));
  const [body, setBody] = useState(clean(draft?.body));

  useEffect(() => {
    setTitle(clean(draft?.title));
    setSummary(clean(draft?.summary));
    setBody(clean(draft?.body));
  }, [draft?.body, draft?.summary, draft?.title]);

  return (
    <div className="think-artifact-draft__editor">
      <label className="think-artifact-draft__field">
        <span>Title</span>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Draft title"
          disabled={busy}
        />
      </label>
      <label className="think-artifact-draft__field">
        <span>Summary</span>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Short framing line"
          rows={2}
          disabled={busy}
        />
      </label>
      <label className="think-artifact-draft__field">
        <span>Body</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Revise the draft before it lands in the workspace."
          rows={8}
          disabled={busy}
        />
      </label>
      <div className="think-artifact-draft__editor-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !clean(title) || !clean(body)}
          onClick={() => onSave?.({
            title,
            summary,
            body
          })}
        >
          {busy ? 'Saving…' : 'Save revision'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

const ArtifactDraftRow = ({
  draft,
  busy = false,
  isEditing = false,
  compact = false,
  onEdit = null,
  onSave = null,
  onCancel = null,
  onPromote = null,
  onDismiss = null,
  onInvokeWorkflowSkill = null,
  workflowContext = null,
  onOpenThreadFromDraft = null,
  onCreateHandoffFromDraft = null,
  onQueueFollowUpLoop = null
}) => {
  const safeStatus = clean(draft?.status).toLowerCase() || 'pending';
  const safeType = clean(draft?.artifactType) || 'draft';
  const safeOutputLabel = formatOutputLabel(draft?.skill?.outputType, safeType);
  const safeTitle = clean(draft?.title) || 'Untitled draft';
  const safeSummary = clean(draft?.summary) || clean(draft?.body).slice(0, 220);
  const promotedPath = clean(draft?.promotedTo?.path);
  const promotedLabel = clean(draft?.promotedTo?.title) || clean(draft?.promotedTo?.type) || 'artifact';
  const workflow = draft?.skill?.workflow && typeof draft.skill.workflow === 'object' ? draft.skill.workflow : null;
  const workflowSteps = Array.isArray(workflow?.steps) ? workflow.steps.filter(Boolean).slice(0, 4) : [];
  const nextSkills = Array.isArray(workflow?.nextSkills) ? workflow.nextSkills.filter((skill) => clean(skill?.id) && clean(skill?.title)).slice(0, 3) : [];
  const continuationContext = workflowContext && typeof workflowContext === 'object' ? workflowContext : {};
  const nextContextType = clean(continuationContext.contextType || draft?.sourceContext?.type);
  const nextContextId = clean(continuationContext.contextId || draft?.sourceContext?.id);
  const nextContextTitle = clean(continuationContext.contextTitle || draft?.sourceContext?.title || draft?.title);
  const isMaintenanceFlow = clean(workflow?.track) === 'maintenance' || Boolean(workflow?.loop) || clean(draft?.skill?.outputType).includes('report');
  const hasProtocolActions = !isEditing && safeStatus !== 'promoted' && (
    typeof onOpenThreadFromDraft === 'function'
    || typeof onCreateHandoffFromDraft === 'function'
    || (isMaintenanceFlow && typeof onQueueFollowUpLoop === 'function')
  );

  return (
    <article className={`think-artifact-draft think-artifact-draft--${safeStatus} think-artifact-draft--${safeOutputLabel.replace(/\s+/g, '-')}`}>
      <div className="think-artifact-draft__head">
        <div className="think-artifact-draft__eyebrow">
          <span>{safeOutputLabel}</span>
          <span>{safeStatus}</span>
        </div>
        <h4>{safeTitle}</h4>
      </div>
      {safeSummary && <p className="think-artifact-draft__summary">{safeSummary}</p>}
      {!compact && workflowSteps.length > 0 && (
        <div className="think-artifact-draft__workflow">
          <div className="think-artifact-draft__workflow-head">
            <span>{clean(workflow?.label) || 'Workflow'}</span>
            <span>{workflowSteps.length} steps</span>
          </div>
          {(formatWorkflowTrack(workflow) || formatWorkflowCadence(workflow)) && (
            <div className="think-artifact-draft__meta">
              {formatWorkflowTrack(workflow) && <span>{formatWorkflowTrack(workflow)}</span>}
              {formatWorkflowCadence(workflow) && <span>{formatWorkflowCadence(workflow)}</span>}
            </div>
          )}
          <ol className="think-artifact-draft__workflow-steps">
            {workflowSteps.map((step, index) => (
              <li key={`${draft?.draftId || safeTitle}-step-${index}`}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="think-artifact-draft__meta">
        {draft?.skill?.title && <span>{draft.skill.title}</span>}
        {draft?.skill?.workerRole && <span>{formatWorkerRole(draft.skill.workerRole)}</span>}
        {draft?.sourceContext?.title && <span>{draft.sourceContext.title}</span>}
        {draft?.updatedAt && <span>{new Date(draft.updatedAt).toLocaleString()}</span>}
      </div>
      {isEditing && safeStatus !== 'promoted' ? (
        <ArtifactDraftEditor
          draft={draft}
          busy={busy}
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : null}
      {promotedPath ? (
        <a href={promotedPath} className="think-artifact-draft__link">
          Open {promotedLabel}
        </a>
      ) : !isEditing ? (
        <div className="think-artifact-draft__actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onEdit?.(draft?.draftId)}
          >
            {busy ? 'Working…' : 'Revise'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onPromote?.(draft?.draftId)}
          >
            {busy ? 'Applying…' : 'Promote'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onDismiss?.(draft?.draftId)}
          >
            {busy ? 'Working…' : 'Dismiss'}
          </Button>
        </div>
      ) : null}
      {!compact && hasProtocolActions && (
        <div className="think-artifact-draft__protocol-actions">
          <span className="think-artifact-draft__continuations-label">Turn into</span>
          <div className="think-artifact-draft__continuations-actions">
            {typeof onOpenThreadFromDraft === 'function' && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onOpenThreadFromDraft?.(draft)}
              >
                Open thread
              </Button>
            )}
            {typeof onCreateHandoffFromDraft === 'function' && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onCreateHandoffFromDraft?.(draft)}
              >
                Delegate
              </Button>
            )}
            {isMaintenanceFlow && typeof onQueueFollowUpLoop === 'function' && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onQueueFollowUpLoop?.(draft)}
              >
                Queue upkeep loop
              </Button>
            )}
          </div>
        </div>
      )}
      {!compact && !isEditing && nextSkills.length > 0 && typeof onInvokeWorkflowSkill === 'function' && (
        <div className="think-artifact-draft__continuations">
          <span className="think-artifact-draft__continuations-label">Continue with</span>
          <div className="think-artifact-draft__continuations-actions">
            {nextSkills.map((skill) => (
              <Button
                key={`${draft?.draftId || safeTitle}-${skill.id}`}
                type="button"
                variant="secondary"
                disabled={busy || !nextContextType || !nextContextId}
                onClick={() => onInvokeWorkflowSkill?.(buildQueuedAgentSkillPrompt(skill, {
                  contextType: nextContextType,
                  contextId: nextContextId,
                  contextTitle: nextContextTitle,
                  mode: 'submit'
                }), draft, skill)}
              >
                {skill.title}
              </Button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};

const AgentArtifactDraftsPanel = ({
  draftsModel,
  title = 'Draft staging',
  subtitle = 'Agent-created outputs waiting to be promoted into the workspace.',
  emptyText = 'No artifact drafts yet.',
  className = '',
  maxPending = 5,
  maxPromoted = 3,
  showPromoted = true,
  compact = false,
  accent = 'default',
  onInvokeWorkflowSkill = null,
  onOpenThreadFromDraft = null,
  onCreateHandoffFromDraft = null,
  onQueueFollowUpLoop = null,
  contextType = '',
  contextId = '',
  contextTitle = ''
}) => {
  const {
    artifactDrafts,
    artifactDraftsLoading,
    artifactDraftsError,
    artifactDraftBusyId,
    pendingCount,
    handleUpdateArtifactDraft,
    handlePromoteArtifactDraft,
    handleDismissArtifactDraft
  } = draftsModel || {};
  const [editingDraftId, setEditingDraftId] = useState('');
  const [protocolActionBusyId, setProtocolActionBusyId] = useState('');
  const [protocolActionError, setProtocolActionError] = useState('');

  const runProtocolDraftAction = async (draft, handler) => {
    if (typeof handler !== 'function' || !draft?.draftId) return;
    setProtocolActionBusyId(draft.draftId);
    setProtocolActionError('');
    try {
      await handler(draft);
    } catch (error) {
      setProtocolActionError(error?.message || 'Failed to run draft action.');
    } finally {
      setProtocolActionBusyId('');
    }
  };

  const pendingDrafts = useMemo(
    () => (Array.isArray(artifactDrafts) ? artifactDrafts : [])
      .filter((draft) => clean(draft?.status).toLowerCase() === 'pending')
      .slice(0, Math.max(1, maxPending)),
    [artifactDrafts, maxPending]
  );

  const promotedDrafts = useMemo(
    () => (Array.isArray(artifactDrafts) ? artifactDrafts : [])
      .filter((draft) => clean(draft?.status).toLowerCase() === 'promoted')
      .slice(0, Math.max(1, maxPromoted)),
    [artifactDrafts, maxPromoted]
  );

  const hasAny = pendingDrafts.length > 0 || promotedDrafts.length > 0;

  return (
    <SurfaceCard className={`think-artifact-drafts-panel think-artifact-drafts-panel--${accent} ${className}`.trim()}>
      <SectionHeader
        title={title}
        subtitle={subtitle}
        action={pendingCount ? <span className="think-artifact-drafts-panel__count">{pendingCount} pending</span> : null}
      />
      {artifactDraftsError && <p className="status-message error-message">{artifactDraftsError}</p>}
      {protocolActionError && <p className="status-message error-message">{protocolActionError}</p>}
      {artifactDraftsLoading ? (
        <p className="muted small">Loading drafts…</p>
      ) : !hasAny ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        <div className="think-artifact-drafts-panel__stack">
          {pendingDrafts.length > 0 && (
            <section className="think-artifact-drafts-panel__group">
              <div className="think-artifact-drafts-panel__group-head">
                <h4>Pending</h4>
                <p>Ready to promote into the workspace as a real deliverable.</p>
              </div>
              <div className="think-artifact-drafts-panel__rows">
                {pendingDrafts.map((draft, index) => (
                  <ArtifactDraftRow
                    key={draft?.draftId || `pending-draft-${index}`}
                    draft={draft}
                    busy={artifactDraftBusyId === draft?.draftId || protocolActionBusyId === draft?.draftId}
                    isEditing={editingDraftId === draft?.draftId}
                    compact={compact}
                    onEdit={setEditingDraftId}
                    onSave={async (payload) => {
                      const result = await handleUpdateArtifactDraft?.(draft?.draftId, payload);
                      if (result?.draft) setEditingDraftId('');
                    }}
                    onCancel={() => setEditingDraftId('')}
                    onPromote={handlePromoteArtifactDraft}
                    onDismiss={handleDismissArtifactDraft}
                    onInvokeWorkflowSkill={onInvokeWorkflowSkill}
                    onOpenThreadFromDraft={(nextDraft) => runProtocolDraftAction(nextDraft, onOpenThreadFromDraft)}
                    onCreateHandoffFromDraft={(nextDraft) => runProtocolDraftAction(nextDraft, onCreateHandoffFromDraft)}
                    onQueueFollowUpLoop={(nextDraft) => runProtocolDraftAction(nextDraft, onQueueFollowUpLoop)}
                    workflowContext={{ contextType, contextId, contextTitle }}
                  />
                ))}
              </div>
            </section>
          )}
          {showPromoted && promotedDrafts.length > 0 && (
            <section className="think-artifact-drafts-panel__group">
              <div className="think-artifact-drafts-panel__group-head">
                <h4>Recently promoted</h4>
                <p>Artifacts that already landed in the workspace.</p>
              </div>
              <div className="think-artifact-drafts-panel__rows">
                {promotedDrafts.map((draft, index) => (
                  <ArtifactDraftRow
                    key={draft?.draftId || `promoted-draft-${index}`}
                    draft={draft}
                    busy={false}
                    compact={compact}
                    onInvokeWorkflowSkill={onInvokeWorkflowSkill}
                    workflowContext={{ contextType, contextId, contextTitle }}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </SurfaceCard>
  );
};

export default AgentArtifactDraftsPanel;
