import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chatWithAgent,
  dismissAgentArtifactDraft,
  getAgentHarnessMetrics,
  getAgentWriteBoundary,
  listAgentRuns,
  listAgentArtifactDrafts,
  promoteAgentArtifactDraft,
  updateAgentProposedChange,
  updateAgentArtifactDraft
} from '../../api/agent';
import { Button, QuietButton, SurfaceCard } from '../ui';
import { buildCanonicalArticlePath } from '../../utils/firstInsight';
import { buildQueuedAgentSkillPrompt } from '../../utils/agentSkillInvocation';
import useProtocolApprovals from '../../hooks/useProtocolApprovals';
import ProtocolApprovalsPanel from './ProtocolApprovalsPanel';
import StructureProposalReview from './StructureProposalReview';
import useAgentReviewState from './useAgentReviewState';
import { AGENT_DEFAULT_PLACEHOLDER, AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import AgentTicker from './AgentTicker';
import AgentPresence from './AgentPresence';

const clean = (value) => String(value || '').trim();
const truncate = (value, limit = 320) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const formatComparisonKey = (key = '') => {
  const parts = clean(key).split('|').map(clean).filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[0]} · ${parts[1]}:${parts[2]}`;
  }
  if (parts.length === 2) return `${parts[0]} · ${parts[1]}`;
  return clean(key) || 'unknown';
};

const formatTelemetryStatus = (status = '') => {
  const safe = clean(status);
  if (safe === 'real_world_underperforming') return 'Underperforming';
  if (safe === 'real_world_outperforming') return 'Outperforming';
  if (safe === 'insufficient_data') return 'Needs data';
  return 'Aligned';
};

const normalizePostureOptions = (options = []) => (
  Array.isArray(options)
    ? options
        .map((option) => ({
          value: clean(option?.value),
          label: clean(option?.label),
          summary: clean(option?.summary)
        }))
        .filter((option) => option.value && option.label)
    : []
);

const normalizeContextMetadata = (metadata = {}) => {
  const source = metadata && typeof metadata === 'object' ? metadata : {};
  const relatedItems = Array.isArray(source.relatedItems)
    ? source.relatedItems
        .map((item) => ({
          type: clean(item?.type),
          id: clean(item?.id),
          title: clean(item?.title),
          snippet: truncate(item?.snippet || '', 200)
        }))
        .filter((item) => item.title || item.id)
        .slice(0, 8)
    : [];
  const openQuestions = Array.isArray(source.openQuestions)
    ? source.openQuestions.map((item) => truncate(item, 180)).filter(Boolean).slice(0, 6)
    : [];
  const nextActions = Array.isArray(source.nextActions)
    ? source.nextActions.map((item) => truncate(item, 180)).filter(Boolean).slice(0, 6)
    : [];
  return {
    summary: truncate(source.summary || source.snippet || '', 420),
    primaryText: truncate(source.primaryText || '', 1200),
    openQuestions,
    nextActions,
    relatedItems
  };
};

const toContext = (contextType, contextId, contextTitle = '', contextMetadata = null) => {
  const type = clean(contextType).toLowerCase();
  const id = clean(contextId);
  if (!type || !id) return null;
  return {
    type,
    id,
    title: clean(contextTitle),
    metadata: normalizeContextMetadata(contextMetadata)
  };
};

const toItemPath = (item = {}) => {
  const type = clean(item.type).toLowerCase();
  const id = clean(item.id);
  const title = clean(item.title);
  if (type === 'article' && id) return buildCanonicalArticlePath(id);
  if ((type === 'notebook' || type === 'note') && id) return `/think?tab=notebook&entryId=${encodeURIComponent(id)}`;
  if (type === 'concept' && title) return `/think?tab=concepts&concept=${encodeURIComponent(title)}`;
  return '';
};

const buildPrompt = (template, contextTitle) => {
  const safeTitle = clean(contextTitle);
  if (!safeTitle) return template;
  return template.replace('{context}', safeTitle);
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

const describeStructureOperationPreview = (operation = {}) => {
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const preview = operation?.preview && typeof operation.preview === 'object' ? operation.preview : {};
  switch (clean(operation?.type)) {
    case 'create_folder':
      return `Create ${clean(payload.name || preview.folderName || 'folder')}`;
    case 'rename_folder':
      return `Rename ${clean(preview.from || payload.folderId || 'folder')} to ${clean(payload.name || preview.to || 'new name')}`;
    case 'move_item':
      return `Move ${clean(preview.itemTitle || payload.itemTitle || payload.itemId || 'item')} into ${clean(preview.destinationFolderName || payload.destinationFolderName || payload.destinationFolderId || 'a better folder')}`;
    case 'merge_folder':
      return `Merge ${clean(preview.sourceFolderName || payload.sourceFolderId || 'folder')} into ${clean(preview.destinationFolderName || payload.destinationFolderName || payload.destinationFolderId || 'the destination folder')}`;
    case 'delete_folder':
      return `Delete ${clean(preview.folderName || payload.folderId || 'obsolete folder')}`;
    default:
      return clean(operation?.title) || formatStatusLabel(operation?.type || 'step');
  }
};

const mapThreadMessages = (thread = null) => (
  Array.isArray(thread?.messages)
    ? thread.messages.map((message, index) => ({
        id: `${clean(thread?.threadId) || 'thread'}-${message?.createdAt || index}-${index}`,
        role: clean(message?.role).toLowerCase() === 'assistant' ? 'assistant' : 'user',
        text: clean(message?.text),
        createdAt: clean(message?.createdAt),
        relatedItems: Array.isArray(message?.relatedItems) ? message.relatedItems : [],
        premiumWebResearchAvailable: message?.metadata?.premiumWebResearchAvailable,
        proposalBundle: message?.proposalBundle && typeof message.proposalBundle === 'object'
          ? message.proposalBundle
          : null,
        planner: message?.metadata?.planner && typeof message.metadata.planner === 'object'
          ? message.metadata.planner
          : null
      })).filter((message) => message.text)
    : []
);

const mapDraft = (draft = {}) => ({
  draftId: clean(draft?.draftId),
  artifactType: clean(draft?.artifactType),
  status: clean(draft?.status) || 'pending',
  title: clean(draft?.title),
  summary: clean(draft?.summary),
  body: clean(draft?.body),
  skill: draft?.skill && typeof draft.skill === 'object'
    ? {
        id: clean(draft.skill.id),
        title: clean(draft.skill.title),
        outputType: clean(draft.skill.outputType),
        workerRole: clean(draft.skill.workerRole),
        workflow: draft.skill.workflow && typeof draft.skill.workflow === 'object'
          ? {
              id: clean(draft.skill.workflow.id),
              label: clean(draft.skill.workflow.label),
              track: clean(draft.skill.workflow.track),
              cadence: clean(draft.skill.workflow.cadence),
              loop: Boolean(draft.skill.workflow.loop),
              steps: Array.isArray(draft.skill.workflow.steps)
                ? draft.skill.workflow.steps.map((step) => clean(step)).filter(Boolean)
                : [],
              nextSkills: Array.isArray(draft.skill.workflow.nextSkills)
                ? draft.skill.workflow.nextSkills.map((skill) => ({
                    id: clean(skill?.id),
                    title: clean(skill?.title),
                    workerRole: clean(skill?.workerRole),
                    outputType: clean(skill?.outputType),
                    instruction: clean(skill?.instruction)
                  })).filter((skill) => skill.id && skill.title)
                : []
            }
          : null
      }
    : null,
  sourceContext: draft?.sourceContext && typeof draft.sourceContext === 'object'
    ? {
        type: clean(draft.sourceContext.type),
        id: clean(draft.sourceContext.id),
        title: clean(draft.sourceContext.title)
      }
    : null,
  promotedTo: draft?.promotedTo && typeof draft.promotedTo === 'object'
    ? {
        type: clean(draft.promotedTo.type),
        id: clean(draft.promotedTo.id),
        title: clean(draft.promotedTo.title),
        path: clean(draft.promotedTo.path)
      }
    : null
});

const mapRun = (run = {}) => ({
  runId: clean(run?.runId),
  title: clean(run?.title),
  status: clean(run?.status) || 'pending',
  completedStepCount: Number(run?.completedStepCount) || 0,
  steps: Array.isArray(run?.steps)
    ? run.steps.map((step = {}) => ({
        opId: clean(step?.opId),
        title: clean(step?.title),
        status: clean(step?.status) || 'pending',
        result: step?.metadata?.result && typeof step.metadata.result === 'object' ? step.metadata.result : null
      }))
    : []
});

const describeRunStepResult = (step = {}) => {
  const result = step?.result && typeof step.result === 'object' ? step.result : null;
  if (!result) return '';
  if (clean(result?.type) === 'related_material') {
    const itemCount = Math.max(0, Number(result?.itemCount) || 0);
    return itemCount > 0
      ? `Staged ${itemCount} related ${itemCount === 1 ? 'item' : 'items'}.`
      : 'Checked for related material.';
  }
  if (clean(result?.type) === 'handoff') {
    return clean(result?.handoff?.title)
      ? `Created handoff: ${result.handoff.title}.`
      : 'Created a routed handoff.';
  }
  return '';
};

const mapProposedChange = (change = {}) => ({
  proposedChangeId: clean(change?.proposedChangeId),
  targetType: clean(change?.targetType),
  targetId: clean(change?.targetId),
  targetTitle: clean(change?.targetTitle),
  status: clean(change?.status) || 'pending',
  summary: clean(change?.summary),
  diffSummary: change?.diffSummary && typeof change.diffSummary === 'object' ? change.diffSummary : {},
  currentSnapshot: change?.currentSnapshot && typeof change.currentSnapshot === 'object' ? change.currentSnapshot : {},
  proposedSnapshot: change?.proposedSnapshot && typeof change.proposedSnapshot === 'object' ? change.proposedSnapshot : {},
  acceptedAt: clean(change?.acceptedAt),
  rejectedAt: clean(change?.rejectedAt),
  rolledBackAt: clean(change?.rolledBackAt)
});

const mapStructureProposal = (proposal = {}) => ({
  structureProposalId: clean(proposal?.structureProposalId),
  sourceThreadId: clean(proposal?.sourceThreadId),
  sourceRunId: clean(proposal?.sourceRunId),
  status: clean(proposal?.status) || 'pending',
  scope: clean(proposal?.scope),
  scopeRef: clean(proposal?.scopeRef),
  title: clean(proposal?.title),
  summary: clean(proposal?.summary),
  rationale: clean(proposal?.rationale),
  acceptedAt: clean(proposal?.acceptedAt),
  rejectedAt: clean(proposal?.rejectedAt),
  rolledBackAt: clean(proposal?.rolledBackAt),
  executionResult: proposal?.executionResult && typeof proposal.executionResult === 'object'
    ? proposal.executionResult
    : null,
  operations: Array.isArray(proposal?.operations)
    ? proposal.operations.map((operation = {}) => ({
        opId: clean(operation?.opId),
        type: clean(operation?.type),
        targetDomain: clean(operation?.targetDomain),
        status: clean(operation?.status) || 'pending',
        payload: operation?.payload && typeof operation.payload === 'object' ? operation.payload : {},
        preview: operation?.preview && typeof operation.preview === 'object' ? operation.preview : {},
        risk: clean(operation?.risk),
        isActionable: operation?.isActionable !== false,
        invalidFields: Array.isArray(operation?.invalidFields) ? operation.invalidFields.map((value) => clean(value)).filter(Boolean) : []
      }))
    : []
});

const getSnapshotText = (snapshot = {}) => truncate(snapshot?.description || snapshot?.content || '', 360);
const formatStatusLabel = (status = '') => clean(status).replace(/_/g, ' ') || 'pending';
const formatDateTime = (value = '') => {
  const safe = clean(value);
  if (!safe) return '';
  const parsed = new Date(safe);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};
const formatPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0%';
  return `${Math.round(numeric * 100)}%`;
};

const ThoughtPartnerPanel = ({
  contextType = '',
  contextId = '',
  contextTitle = '',
  placeholder = AGENT_DEFAULT_PLACEHOLDER,
  className = '',
  title = AGENT_DISPLAY_NAME,
  subtitle = '',
  promptTemplates: promptTemplatesProp = null,
  showQuickPrompts = true,
  emptyStateText = 'Start with a question, or pick a prompt above.',
  submitLabel = 'Ask',
  variant = 'default',
  thread = null,
  onThreadChange = null,
  queuedPrompt = null,
  contextMetadata = null,
  disabled = false,
  posture = '',
  postureOptions = [],
  onPostureChange = null,
  passiveStatusText = 'Quiet mode is active. The agent is watching for reusable structure without steering the draft.'
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState('');
  const [artifactDrafts, setArtifactDrafts] = useState([]);
  const [proposalBundles, setProposalBundles] = useState([]);
  const [runs, setRuns] = useState([]);
  const [harnessMetrics, setHarnessMetrics] = useState(null);
  const [writeBoundarySummary, setWriteBoundarySummary] = useState(null);
  const [editingProposedChangeId, setEditingProposedChangeId] = useState('');
  const [editingProposedChangeText, setEditingProposedChangeText] = useState('');
  const [artifactDraftLoadingId, setArtifactDraftLoadingId] = useState('');
  const [editingDraftId, setEditingDraftId] = useState('');
  const [editingDraftTitle, setEditingDraftTitle] = useState('');
  const [editingDraftSummary, setEditingDraftSummary] = useState('');
  const [editingDraftBody, setEditingDraftBody] = useState('');
  const [pendingSkillInvocation, setPendingSkillInvocation] = useState(null);
  const handledQueuedPromptIdRef = useRef('');
  const threadViewportRef = useRef(null);
  const activeThreadId = clean(threadId || thread?.threadId);
  const isStreamVariant = variant === 'stream';
  const isThreadStreamVariant = isStreamVariant && Boolean(activeThreadId);
  const normalizedPostureOptions = useMemo(
    () => normalizePostureOptions(postureOptions),
    [postureOptions]
  );
  const activePosture = useMemo(() => (
    normalizedPostureOptions.find((option) => option.value === posture)
      || normalizedPostureOptions[0]
      || null
  ), [normalizedPostureOptions, posture]);
  const activePostureValue = activePosture?.value || '';
  const isPassiveNotebookPosture = activePostureValue === 'notebook';

  const context = useMemo(
    () => toContext(contextType, contextId, contextTitle, contextMetadata),
    [contextId, contextMetadata, contextTitle, contextType]
  );
  const promptTemplates = useMemo(() => (
    Array.isArray(promptTemplatesProp) && promptTemplatesProp.length > 0
      ? promptTemplatesProp
      : [
          'Summarize what matters most in {context}.',
          'Find related notes or concepts for this idea.',
          'Challenge my current thinking and point out weak spots.'
        ]
  ), [promptTemplatesProp]);

  const hydrateFromThread = useCallback((nextThread) => {
    const safeThreadId = clean(nextThread?.threadId);
    if (!safeThreadId) return;
    setThreadId(safeThreadId);
    setMessages(mapThreadMessages(nextThread));
    setProposalBundles(
      Array.isArray(nextThread?.proposalBundles)
        ? nextThread.proposalBundles.filter((bundle) => clean(bundle?.bundleId))
        : []
    );
  }, []);

  const loadArtifactDrafts = useCallback(async (nextThreadId) => {
    const safeThreadId = clean(nextThreadId);
    if (!safeThreadId) {
      setArtifactDrafts([]);
      return;
    }
    try {
      const result = await listAgentArtifactDrafts({ threadId: safeThreadId, status: 'all' });
      setArtifactDrafts(Array.isArray(result?.drafts) ? result.drafts.map(mapDraft) : []);
    } catch (loadError) {
      // Keep the panel usable even if draft hydration fails.
    }
  }, []);

  const loadHarnessMetrics = useCallback(async (nextThreadId) => {
    const safeThreadId = clean(nextThreadId);
    if (!safeThreadId) {
      setHarnessMetrics(null);
      return;
    }
    try {
      const result = await getAgentHarnessMetrics({ threadId: safeThreadId });
      setHarnessMetrics(result?.metrics && typeof result.metrics === 'object' ? result.metrics : null);
    } catch (_error) {
      // Keep the panel usable even if metrics hydration fails.
    }
  }, []);

  const loadWriteBoundary = useCallback(async (nextThreadId) => {
    const safeThreadId = clean(nextThreadId);
    if (!safeThreadId) {
      setWriteBoundarySummary(null);
      return;
    }
    try {
      const result = await getAgentWriteBoundary({
        threadId: safeThreadId,
        workspaceType: context?.type || '',
        workspaceId: context?.id || '',
        limit: 4
      });
      setWriteBoundarySummary(result?.summary && typeof result.summary === 'object' ? result.summary : null);
    } catch (_error) {
      // Keep the panel usable even if write-boundary hydration fails.
    }
  }, [context?.id, context?.type]);

  const loadRuns = useCallback(async (nextThreadId) => {
    const safeThreadId = clean(nextThreadId);
    if (!safeThreadId) {
      setRuns([]);
      return;
    }
    try {
      const result = await listAgentRuns({ threadId: safeThreadId, status: 'all' });
      setRuns(Array.isArray(result?.runs) ? result.runs.map(mapRun) : []);
    } catch (_error) {
      // Keep the panel usable even if run hydration fails.
    }
  }, []);

  const {
    proposedChangeLoadingId,
    structureProposalLoadingId,
    structureProposalOperationLoadingId,
    setProposedChangeLoadingId,
    pendingProposedChanges,
    resolvedProposedChanges,
    pendingStructureProposals,
    resolvedStructureProposals,
    clearReviewState,
    replaceProposedChange,
    replaceStructureProposal,
    loadProposedChanges,
    loadStructureProposals,
    handleAcceptProposedChange,
    handleRejectProposedChange,
    handleRollbackProposedChange,
    handleUpdateStructureProposalOperationStatus,
    handleBulkUpdateStructureProposalOperationStatus,
    handleApplyStructureProposal,
    handleRejectStructureProposal,
    handleRollbackStructureProposal
  } = useAgentReviewState({
    activeThreadId,
    mapProposedChange,
    mapStructureProposal,
    loadRuns,
    loadHarnessMetrics,
    setError
  });

  const runApprovalModel = useProtocolApprovals({
    initialStatus: 'pending',
    limit: 12,
    threadId: activeThreadId,
    op: 'runs.resume',
    autoLoad: Boolean(activeThreadId),
    onChanged: async () => {
      if (!activeThreadId) return;
      await loadRuns(activeThreadId);
      await loadProposedChanges(activeThreadId);
      await loadStructureProposals(activeThreadId);
      await loadHarnessMetrics(activeThreadId);
      await loadWriteBoundary(activeThreadId);
    }
  });
  const memoryApprovalModel = useProtocolApprovals({
    initialStatus: 'pending',
    limit: 12,
    threadId: activeThreadId,
    op: 'memory.commit',
    autoLoad: Boolean(activeThreadId),
    onChanged: async () => {
      if (!activeThreadId) return;
      await loadHarnessMetrics(activeThreadId);
      await loadWriteBoundary(activeThreadId);
    }
  });

  const submitMessage = useCallback(async (rawMessage, options = {}) => {
    const message = clean(rawMessage);
    if (!message || loading || disabled) return;
    setError('');
    setLoading(true);
    setInput('');

    const userMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      text: message,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const result = await chatWithAgent({
        message,
        threadId: threadId || clean(thread?.threadId) || undefined,
        threadTitle: clean(thread?.title) || contextTitle || title,
        persistThread: true,
        context,
        skillInvocation:
          (options?.skillInvocation && typeof options.skillInvocation === 'object'
            ? options.skillInvocation
            : options?.allowPendingSkillInvocation !== false && pendingSkillInvocation && typeof pendingSkillInvocation === 'object'
              ? pendingSkillInvocation
              : undefined),
        history: messages.map((entry) => ({
          role: entry.role,
          text: entry.text
        })),
        limit: 6
      });
      const assistantMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        text: clean(result?.reply) || 'No reply generated.',
        createdAt: new Date().toISOString(),
        relatedItems: Array.isArray(result?.relatedItems) ? result.relatedItems : [],
        premiumWebResearchAvailable: Boolean(result?.premiumWebResearchAvailable),
        proposalBundle: result?.proposalBundle && typeof result.proposalBundle === 'object'
          ? result.proposalBundle
          : null,
        planner: result?.planner && typeof result.planner === 'object' ? result.planner : null
      };
      const hydratedMessages = result?.thread?.threadId ? mapThreadMessages(result.thread) : [];
      const didHydrateThread = Boolean(result?.thread?.threadId && hydratedMessages.length > 0);
      const responseProposedChanges = Array.isArray(result?.proposedChanges)
        ? result.proposedChanges
        : (result?.proposedChange ? [result.proposedChange] : []);
      const responseStructureProposals = Array.isArray(result?.structureProposals)
        ? result.structureProposals
        : Array.isArray(result?.proposals)
          ? result.proposals
          : (result?.structureProposal || result?.proposal ? [result.structureProposal || result.proposal] : []);
      if (result?.thread?.threadId) {
        const threadForUi = didHydrateThread
          ? result.thread
          : {
              ...result.thread,
              messages: [...messages, userMessage, assistantMessage].map((entry) => ({
                role: entry.role,
                text: entry.text,
                createdAt: entry.createdAt,
                relatedItems: Array.isArray(entry.relatedItems) ? entry.relatedItems : [],
                metadata: {
                  premiumWebResearchAvailable: entry.premiumWebResearchAvailable,
                  planner: entry.planner && typeof entry.planner === 'object' ? entry.planner : undefined
                },
                proposalBundle: entry.proposalBundle && typeof entry.proposalBundle === 'object'
                  ? entry.proposalBundle
                  : undefined
              }))
            };
        hydrateFromThread(threadForUi);
        loadArtifactDrafts(result.thread.threadId);
        loadRuns(result.thread.threadId);
        if (responseProposedChanges.length === 0) loadProposedChanges(result.thread.threadId);
        if (responseStructureProposals.length === 0) loadStructureProposals(result.thread.threadId);
        loadHarnessMetrics(result.thread.threadId);
        loadWriteBoundary(result.thread.threadId);
        if (typeof onThreadChange === 'function') onThreadChange(threadForUi);
      } else {
        setMessages(prev => [...prev, assistantMessage]);
      }
      responseProposedChanges.forEach((change) => {
        if (clean(change?.proposedChangeId)) replaceProposedChange(change);
      });
      responseStructureProposals.forEach((proposal) => {
        if (clean(proposal?.structureProposalId)) replaceStructureProposal(proposal);
      });
      if (result?.draftArtifact?.draftId) {
        setArtifactDrafts(prev => {
          const nextDraft = mapDraft(result.draftArtifact);
          const remaining = prev.filter((entry) => entry.draftId !== nextDraft.draftId);
          return [nextDraft, ...remaining];
        });
      }
      setPendingSkillInvocation(null);
    } catch (chatError) {
      setInput(message);
      setError(chatError.response?.data?.error || 'Failed to ask thought partner.');
    } finally {
      setLoading(false);
    }
  }, [context, contextTitle, disabled, hydrateFromThread, loadArtifactDrafts, loadHarnessMetrics, loadProposedChanges, loadRuns, loadStructureProposals, loadWriteBoundary, loading, messages, onThreadChange, pendingSkillInvocation, replaceProposedChange, replaceStructureProposal, thread?.threadId, thread?.title, threadId, title]);

  const handleExecuteProposalBundle = useCallback((bundle = {}) => {
    const title = clean(bundle?.title);
    submitMessage(title ? `Execute ${title}` : 'Execute it', {
      allowPendingSkillInvocation: false
    });
  }, [submitMessage]);

  useEffect(() => {
    if (clean(thread?.threadId)) {
      hydrateFromThread(thread);
      setError('');
      return;
    }
    setMessages([]);
    setThreadId('');
    setArtifactDrafts([]);
    setProposalBundles([]);
    setRuns([]);
    setHarnessMetrics(null);
    setWriteBoundarySummary(null);
    clearReviewState();
    setEditingProposedChangeId('');
    setEditingProposedChangeText('');
    setEditingDraftId('');
    setEditingDraftTitle('');
    setEditingDraftSummary('');
    setEditingDraftBody('');
    setPendingSkillInvocation(null);
    setError('');
  }, [clearReviewState, contextId, contextType, hydrateFromThread, thread]);

  useEffect(() => {
    if (!activeThreadId) return;
    loadArtifactDrafts(activeThreadId);
    loadRuns(activeThreadId);
    loadProposedChanges(activeThreadId);
    loadStructureProposals(activeThreadId);
    loadHarnessMetrics(activeThreadId);
    loadWriteBoundary(activeThreadId);
  }, [activeThreadId, loadArtifactDrafts, loadHarnessMetrics, loadProposedChanges, loadRuns, loadStructureProposals, loadWriteBoundary]);

  useEffect(() => {
    if (!threadViewportRef.current || messages.length === 0) return;
    threadViewportRef.current.scrollTop = isThreadStreamVariant ? 0 : threadViewportRef.current.scrollHeight;
  }, [isThreadStreamVariant, messages]);

  useEffect(() => {
    const queuedId = clean(queuedPrompt?.id);
    if (!queuedId || handledQueuedPromptIdRef.current === queuedId) return;

    const queuedContextType = clean(queuedPrompt?.contextType).toLowerCase();
    const queuedContextId = clean(queuedPrompt?.contextId);
    const safeContextType = clean(contextType).toLowerCase();
    const safeContextId = clean(contextId);

    if (queuedContextType && safeContextType && queuedContextType !== safeContextType) return;
    if (queuedContextId && safeContextId && queuedContextId !== safeContextId) return;

    handledQueuedPromptIdRef.current = queuedId;
    const prompt = clean(queuedPrompt?.prompt);
    if (!prompt) return;
    const skillInvocation = {
      skillId: clean(queuedPrompt?.skillId),
      skillTitle: clean(queuedPrompt?.skillTitle),
      outputType: clean(queuedPrompt?.outputType),
      workerRole: clean(queuedPrompt?.workerRole),
      workflow: queuedPrompt?.workflow && typeof queuedPrompt.workflow === 'object' ? queuedPrompt.workflow : null
    };
    if (clean(queuedPrompt?.mode).toLowerCase() === 'draft') {
      setPendingSkillInvocation(skillInvocation);
      setInput(prompt);
      return;
    }
    submitMessage(prompt, {
      skillInvocation
    });
  }, [contextId, contextType, queuedPrompt, submitMessage]);

  const handlePromoteDraft = useCallback(async (draftId) => {
    const safeId = clean(draftId);
    if (!safeId) return;
    setArtifactDraftLoadingId(safeId);
    try {
      const result = await promoteAgentArtifactDraft(safeId);
      if (result?.draft) {
        const nextDraft = mapDraft(result.draft);
        setArtifactDrafts(prev => prev.map((entry) => (entry.draftId === nextDraft.draftId ? nextDraft : entry)));
      }
    } catch (promoteError) {
      setError(promoteError.response?.data?.error || 'Failed to promote draft.');
    } finally {
      setArtifactDraftLoadingId('');
    }
  }, []);

  const handleContinueWorkflowDraft = useCallback((draft, nextSkill) => {
    const safeSkill = nextSkill && typeof nextSkill === 'object' ? nextSkill : {};
    const safeContextType = clean(contextType || draft?.sourceContext?.type);
    const safeContextId = clean(contextId || draft?.sourceContext?.id);
    const safeContextTitle = clean(contextTitle || draft?.sourceContext?.title || draft?.title);
    if (!safeContextType || !safeContextId || !clean(safeSkill?.id)) return;
    const queued = buildQueuedAgentSkillPrompt(safeSkill, {
      contextType: safeContextType,
      contextId: safeContextId,
      contextTitle: safeContextTitle,
      mode: 'submit'
    });
    submitMessage(queued.prompt, {
      skillInvocation: {
        skillId: clean(queued.skillId),
        skillTitle: clean(queued.skillTitle),
        outputType: clean(queued.outputType),
        workerRole: clean(queued.workerRole),
        workflow: queued.workflow && typeof queued.workflow === 'object' ? queued.workflow : null
      }
    });
  }, [contextId, contextTitle, contextType, submitMessage]);

  const handleStartEditDraft = useCallback((draft) => {
    const safeId = clean(draft?.draftId);
    if (!safeId) return;
    setEditingDraftId(safeId);
    setEditingDraftTitle(clean(draft?.title));
    setEditingDraftSummary(clean(draft?.summary));
    setEditingDraftBody(clean(draft?.body));
  }, []);

  const handleCancelEditDraft = useCallback(() => {
    setEditingDraftId('');
    setEditingDraftTitle('');
    setEditingDraftSummary('');
    setEditingDraftBody('');
  }, []);

  const handleSaveEditDraft = useCallback(async (draftId) => {
    const safeId = clean(draftId);
    if (!safeId) return;
    setArtifactDraftLoadingId(safeId);
    try {
      const result = await updateAgentArtifactDraft(safeId, {
        title: editingDraftTitle,
        summary: editingDraftSummary,
        body: editingDraftBody
      });
      if (result?.draft) {
        const nextDraft = mapDraft(result.draft);
        setArtifactDrafts(prev => prev.map((entry) => (entry.draftId === nextDraft.draftId ? nextDraft : entry)));
        handleCancelEditDraft();
      }
    } catch (updateError) {
      setError(updateError.response?.data?.error || 'Failed to update draft.');
    } finally {
      setArtifactDraftLoadingId('');
    }
  }, [editingDraftBody, editingDraftSummary, editingDraftTitle, handleCancelEditDraft]);

  const handleDismissDraft = useCallback(async (draftId) => {
    const safeId = clean(draftId);
    if (!safeId) return;
    setArtifactDraftLoadingId(safeId);
    try {
      const result = await dismissAgentArtifactDraft(safeId);
      if (result?.draft) {
        const nextDraft = mapDraft(result.draft);
        setArtifactDrafts(prev => prev.map((entry) => (entry.draftId === nextDraft.draftId ? nextDraft : entry)));
      }
    } catch (dismissError) {
      setError(dismissError.response?.data?.error || 'Failed to dismiss draft.');
    } finally {
      setArtifactDraftLoadingId('');
    }
  }, []);

  const handleStartEditProposedChange = useCallback((change) => {
    const safeId = clean(change?.proposedChangeId);
    if (!safeId) return;
    setEditingProposedChangeId(safeId);
    setEditingProposedChangeText(
      clean(change?.proposedSnapshot?.description || change?.proposedSnapshot?.content)
    );
  }, []);

  const handleCancelEditProposedChange = useCallback(() => {
    setEditingProposedChangeId('');
    setEditingProposedChangeText('');
  }, []);

  const handleSaveProposedChangeEdit = useCallback(async (change) => {
    const safeId = clean(change?.proposedChangeId);
    if (!safeId) return;
    setProposedChangeLoadingId(safeId);
    try {
      const isConcept = clean(change?.targetType).toLowerCase() === 'concept';
      const result = await updateAgentProposedChange(safeId, {
        proposedSnapshot: isConcept
          ? {
              description: editingProposedChangeText
            }
          : {
              content: editingProposedChangeText,
              blocks: clean(editingProposedChangeText)
                ? [{ id: 'agent-proposed-block-edit', type: 'paragraph', text: editingProposedChangeText }]
                : []
            }
      });
      if (result?.proposedChange) {
        replaceProposedChange(result.proposedChange);
        handleCancelEditProposedChange();
      }
    } catch (updateError) {
      setError(updateError.response?.data?.error || 'Failed to update proposed change.');
    } finally {
      setProposedChangeLoadingId('');
    }
  }, [editingProposedChangeText, handleCancelEditProposedChange, replaceProposedChange, setProposedChangeLoadingId]);

  const lastAssistantMessage = useMemo(() => (
    [...messages].reverse().find(entry => entry.role === 'assistant') || null
  ), [messages]);
  const visibleMessages = useMemo(() => (
    isStreamVariant
      ? messages
          .map((message, index) => ({ message, index }))
          .sort((left, right) => {
            const leftTime = Date.parse(left.message.createdAt || '');
            const rightTime = Date.parse(right.message.createdAt || '');
            const safeLeft = Number.isFinite(leftTime) ? leftTime : left.index;
            const safeRight = Number.isFinite(rightTime) ? rightTime : right.index;
            return safeRight - safeLeft || right.index - left.index;
          })
          .map(({ message }) => message)
      : messages
  ), [isStreamVariant, messages]);
  const activePlanner = useMemo(() => (
    (lastAssistantMessage?.planner && typeof lastAssistantMessage.planner === 'object'
      ? lastAssistantMessage.planner
      : null)
    || (thread?.planner && typeof thread.planner === 'object' ? thread.planner : null)
    || (pendingSkillInvocation?.workerRole
      ? {
          activeWorkerRole: clean(pendingSkillInvocation.workerRole),
          activeWorkerLabel: formatWorkerRole(pendingSkillInvocation.workerRole),
          rationale: `${formatWorkerRole(pendingSkillInvocation.workerRole)} is queued for the next pass.`
        }
      : null)
  ), [lastAssistantMessage?.planner, pendingSkillInvocation?.workerRole, thread?.planner]);
  const visibleArtifactDrafts = useMemo(
    () => artifactDrafts.filter((draft) => draft.status !== 'dismissed'),
    [artifactDrafts]
  );
  const latestPendingProposalBundle = useMemo(() => {
    const fromThread = [...proposalBundles]
      .reverse()
      .find((bundle) => clean(bundle?.status).toLowerCase() === 'pending') || null;
    if (fromThread) return fromThread;
    return [...messages]
      .reverse()
      .map((message) => (message?.proposalBundle && typeof message.proposalBundle === 'object' ? message.proposalBundle : null))
      .find((bundle) => bundle && clean(bundle?.status).toLowerCase() === 'pending') || null;
  }, [messages, proposalBundles]);
  const harnessStats = useMemo(() => {
    if (!harnessMetrics || typeof harnessMetrics !== 'object') return [];
    const reviewQueueCount = Number(harnessMetrics?.proposedChangeStatuses?.pending || 0)
      + Number(harnessMetrics?.structureProposalStatuses?.pending || 0);
    const stats = [
      {
        label: 'Resolution',
        value: formatPercent(harnessMetrics?.rates?.bundleResolutionSuccessRate),
        detail: `${Number(harnessMetrics?.funnel?.executionIntentMatched || 0)} matched approvals`
      },
      {
        label: 'Run completion',
        value: formatPercent(harnessMetrics?.rates?.runCompletionRate),
        detail: `${Number(harnessMetrics?.runStatuses?.completed || 0)} completed runs`
      },
      {
        label: 'Review queue',
        value: String(reviewQueueCount),
        detail: 'Pending edits and structure plans'
      },
      {
        label: 'Draft fallback',
        value: String(Number(harnessMetrics?.funnel?.draftFallbacks || 0)),
        detail: 'Replies that still staged drafts'
      }
    ];
    const latestHarnessRun = harnessMetrics?.runHistory?.latestRun;
    if (latestHarnessRun && typeof latestHarnessRun === 'object') {
      const fixtureLabel = latestHarnessRun.fixtureSet ? ` ${latestHarnessRun.fixtureSet}` : '';
      stats.push({
        label: 'Harness live',
        value: formatPercent(latestHarnessRun.passRate),
        detail: `${Number(latestHarnessRun.passed || 0)}/${Number(latestHarnessRun.total || 0)} latest ${latestHarnessRun.mode || 'run'}${fixtureLabel}`
      });
    }
    return stats;
  }, [harnessMetrics]);
  const harnessModelComparisons = useMemo(() => {
    const comparisons = harnessMetrics?.runHistory?.aggregates?.comparisons || {};
    const liveRows = Array.isArray(comparisons.byLiveRouteModelProvider) ? comparisons.byLiveRouteModelProvider : [];
    const rows = liveRows.length > 0 ? liveRows : comparisons.byRouteModelProvider;
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => Number(row.total || 0) > 0)
      .slice(0, 3)
      .map((row) => ({
        key: row.key,
        label: formatComparisonKey(row.key),
        passRate: formatPercent(row.passRate),
        detail: `${Number(row.passed || 0)}/${Number(row.total || 0)} · ${Number(row.avgLatencyMs || 0)}ms avg`
      }));
  }, [harnessMetrics]);
  const writeBoundaryCards = useMemo(() => {
    if (!writeBoundarySummary || typeof writeBoundarySummary !== 'object') return [];
    const memoryTotal = Number(writeBoundarySummary?.memoryCommits?.total || 0);
    const pendingMemoryApprovals = Array.isArray(memoryApprovalModel.protocolApprovals)
      ? memoryApprovalModel.protocolApprovals.length
      : 0;
    const pendingStructure = Number(writeBoundarySummary?.structureProposals?.pending || 0);
    const appliedStructure = Number(writeBoundarySummary?.structureProposals?.applied || 0);
    return [
      {
        label: 'Memory commits',
        value: String(memoryTotal),
        detail: pendingMemoryApprovals > 0
          ? `${pendingMemoryApprovals} pending approval · ${memoryTotal} committed`
          : memoryTotal === 1
            ? '1 approved working-memory write'
            : `${memoryTotal} approved working-memory writes`
      },
      {
        label: 'Structure review',
        value: String(pendingStructure),
        detail: `${pendingStructure} pending · ${appliedStructure} applied`
      }
    ];
  }, [memoryApprovalModel.protocolApprovals, writeBoundarySummary]);
  const outcomeTelemetryRows = useMemo(() => {
    const buckets = harnessMetrics?.outcomeTelemetry?.buckets;
    if (!Array.isArray(buckets)) return [];
    return [...buckets]
      .sort((left, right) => {
        const priority = {
          real_world_underperforming: 0,
          insufficient_data: 1,
          aligned: 2,
          real_world_outperforming: 3
        };
        return Number(priority[clean(left.status)] ?? 4) - Number(priority[clean(right.status)] ?? 4);
      })
      .slice(0, 2)
      .map((bucket) => ({
        id: bucket.id,
        label: bucket.label || bucket.id,
        status: formatTelemetryStatus(bucket.status),
        value: formatPercent(bucket.observed?.acceptanceRate),
        detail: `real ${Number(bucket.observed?.resolved || 0)} resolved · harness ${formatPercent(bucket.harness?.passRate)}`
      }));
  }, [harnessMetrics]);
  const partnerSubtitle = subtitle || (contextTitle ? `Context: ${contextTitle}` : 'Ask about your notes, concepts, and articles.');
  const tickerLines = useMemo(() => {
    const lines = [];
    const safeContextTitle = clean(contextTitle || context?.title || contextId);
    if (loading) {
      lines.push('reading current context');
      if (safeContextTitle) lines.push(`testing ${safeContextTitle}`);
      lines.push('drafting response');
      return lines;
    }
    if (activePlanner?.activeWorkerLabel) {
      lines.push(`worker ${activePlanner.activeWorkerLabel}`);
    }
    const pendingRun = runs.find((run) => !['completed', 'failed', 'cancelled'].includes(clean(run.status).toLowerCase()));
    if (pendingRun) {
      lines.push(`running ${pendingRun.title || pendingRun.runId || 'agent task'}`);
    }
    if (latestPendingProposalBundle) {
      lines.push(`proposal ready · ${latestPendingProposalBundle.title || 'review staged'}`);
    }
    const relatedCount = Array.isArray(context?.metadata?.relatedItems) ? context.metadata.relatedItems.length : 0;
    if (relatedCount > 0) {
      lines.push(`holding ${relatedCount} related ${relatedCount === 1 ? 'item' : 'items'}`);
    }
    if (safeContextTitle) {
      lines.push(`anchored to ${safeContextTitle}`);
    }
    return lines.slice(0, 3);
  }, [
    activePlanner?.activeWorkerLabel,
    context?.metadata?.relatedItems,
    context?.title,
    contextId,
    contextTitle,
    latestPendingProposalBundle,
    loading,
    runs
  ]);
  const tickerState = loading ? 'working' : (runs.some((run) => !['completed', 'failed', 'cancelled'].includes(clean(run.status).toLowerCase())) ? 'working' : 'idle');
  const handleFocusReviewStage = useCallback(() => {
    const reviewNode = document.querySelector('.agent-thought-partner__review-card--structure, .agent-thought-partner__review-card');
    if (reviewNode && typeof reviewNode.scrollIntoView === 'function') {
      reviewNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);
  const streamPlanPreview = useMemo(() => {
    if (!isThreadStreamVariant) return null;
    const primaryStructureProposal = pendingStructureProposals[0] || null;
    if (primaryStructureProposal) {
      const activeOperations = (Array.isArray(primaryStructureProposal.operations) ? primaryStructureProposal.operations : [])
        .filter((operation) => clean(operation?.status).toLowerCase() !== 'rejected')
        .slice(0, 2)
        .map((operation) => describeStructureOperationPreview(operation))
        .filter(Boolean);
      return {
        eyebrow: 'Organization plan',
        title: clean(primaryStructureProposal.title) || 'Pending organization plan',
        summary: truncate(primaryStructureProposal.summary || primaryStructureProposal.rationale, 150)
          || 'The agent staged a cleanup plan for review before anything moves.',
        meta: [
          latestPendingProposalBundle ? 'ready to execute' : 'reviewable',
          primaryStructureProposal.scopeRef ? `scope ${clean(primaryStructureProposal.scopeRef)}` : '',
          Array.isArray(primaryStructureProposal.operations) ? `${primaryStructureProposal.operations.length} planned steps` : ''
        ].filter(Boolean),
        bullets: activeOperations,
        proposalBundle: latestPendingProposalBundle,
        hasReviewStage: true
      };
    }

    if (latestPendingProposalBundle) {
      const bundleSteps = (Array.isArray(latestPendingProposalBundle.operations) ? latestPendingProposalBundle.operations : [])
        .slice(0, 3)
        .map((operation) => clean(operation?.title))
        .filter(Boolean);
      return {
        eyebrow: 'Proposed work',
        title: clean(latestPendingProposalBundle.title) || 'Pending agent proposal',
        summary: truncate(latestPendingProposalBundle.summary, 170)
          || 'The agent has staged work and is waiting for your approval before it changes anything.',
        meta: [
          'ready to execute',
          bundleSteps.length > 0 ? `${bundleSteps.length} planned steps` : ''
        ].filter(Boolean),
        bullets: bundleSteps,
        proposalBundle: latestPendingProposalBundle,
        hasReviewStage: pendingStructureProposals.length > 0
      };
    }

    const planObjective = clean(thread?.plan?.objective);
    const plannerRationale = clean(thread?.planner?.rationale || activePlanner?.rationale);
    const planSteps = (Array.isArray(thread?.plan?.steps) ? thread.plan.steps : [])
      .slice(0, 2)
      .map((step) => clean(step?.title))
      .filter(Boolean);
    const checkpointActions = (Array.isArray(thread?.checkpoint?.nextActions) ? thread.checkpoint.nextActions : [])
      .slice(0, 2)
      .map((step) => clean(step))
      .filter(Boolean);
    const bullets = planSteps.length > 0 ? planSteps : checkpointActions;
    if (!planObjective && !plannerRationale && bullets.length === 0) return null;
    return {
      eyebrow: 'Plan at a glance',
      title: planObjective || 'Continue the working plan',
      summary: truncate(plannerRationale
        || clean(contextMetadata?.summary)
        || 'Use the current plan to pick the next sharp move.', 150),
      meta: [
        latestPendingProposalBundle ? 'ready to execute' : '',
        clean(thread?.planner?.activeWorkerLabel || activePlanner?.activeWorkerLabel)
          ? `specialist ${clean(thread?.planner?.activeWorkerLabel || activePlanner?.activeWorkerLabel)}`
          : '',
        Array.isArray(thread?.plan?.steps) && thread.plan.steps.length > 0 ? `${thread.plan.steps.length} plan steps` : ''
      ].filter(Boolean),
      bullets,
      proposalBundle: latestPendingProposalBundle,
      hasReviewStage: pendingStructureProposals.length > 0
    };
  }, [activePlanner?.activeWorkerLabel, activePlanner?.rationale, contextMetadata?.summary, isThreadStreamVariant, latestPendingProposalBundle, pendingStructureProposals, thread?.checkpoint?.nextActions, thread?.plan?.objective, thread?.plan?.steps, thread?.planner?.activeWorkerLabel, thread?.planner?.rationale]);
  const handleComposerSubmit = useCallback((event) => {
    if (event?.preventDefault) event.preventDefault();
    submitMessage(input);
  }, [input, submitMessage]);
  const handleComposerKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submitMessage(input);
    }
  }, [input, submitMessage]);
  const handleClearPanel = useCallback(() => {
    setMessages([]);
    setThreadId('');
    setArtifactDrafts([]);
    setProposalBundles([]);
    setRuns([]);
    clearReviewState();
    setEditingProposedChangeId('');
    setEditingProposedChangeText('');
    setEditingDraftId('');
    setEditingDraftTitle('');
    setEditingDraftSummary('');
    setEditingDraftBody('');
    setPendingSkillInvocation(null);
  }, [clearReviewState]);

  const quickPromptsSection = (
    <div className="agent-thought-partner__quick-prompts">
      {promptTemplates.map((template) => {
        const prompt = buildPrompt(template, contextTitle || contextId);
        return (
          <QuietButton
            key={template}
            type="button"
            disabled={loading || disabled}
            onClick={() => submitMessage(prompt, { allowPendingSkillInvocation: false })}
          >
            {prompt}
          </QuietButton>
        );
      })}
    </div>
  );
  const postureControlSection = normalizedPostureOptions.length > 0 ? (
    <div className="agent-thought-partner__postures" role="group" aria-label="Think posture">
      <div className="agent-thought-partner__posture-tabs">
        {normalizedPostureOptions.map((option) => {
          const isActive = activePosture?.value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`agent-thought-partner__posture-tab ${isActive ? 'is-active' : ''}`.trim()}
              aria-pressed={isActive}
              disabled={disabled || typeof onPostureChange !== 'function'}
              onClick={() => onPostureChange?.(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {activePosture?.summary ? (
        <p className="agent-thought-partner__posture-summary">{activePosture.summary}</p>
      ) : null}
    </div>
  ) : null;

  const plannerStripSection = !isThreadStreamVariant && activePlanner ? (
    <div className="agent-thought-partner__planner-strip">
      <div className="agent-thought-partner__planner-pill">
        <span className="agent-thought-partner__planner-label">Active specialist</span>
        <strong>{activePlanner.activeWorkerLabel || formatWorkerRole(activePlanner.activeWorkerRole) || 'Planner'}</strong>
      </div>
      {clean(activePlanner.rationale) && (
        <p className="agent-thought-partner__planner-copy">{activePlanner.rationale}</p>
      )}
    </div>
  ) : null;

  const scorecardSection = !isThreadStreamVariant && harnessStats.length > 0 ? (
    <div className="agent-thought-partner__scorecard">
      {harnessStats.map((stat) => (
        <article key={stat.label} className="agent-thought-partner__scorecard-item">
          <span className="agent-thought-partner__scorecard-label">{stat.label}</span>
          <strong>{stat.value}</strong>
          <p>{stat.detail}</p>
        </article>
      ))}
    </div>
  ) : null;

  const modelComparisonSection = !isThreadStreamVariant && harnessModelComparisons.length > 0 ? (
    <div className="agent-thought-partner__scorecard agent-thought-partner__scorecard--models" aria-label="Model route comparison">
      {harnessModelComparisons.map((row) => (
        <article key={row.key} className="agent-thought-partner__scorecard-item">
          <span className="agent-thought-partner__scorecard-label">Model route</span>
          <strong>{row.passRate}</strong>
          <p>{row.label}</p>
          <p>{row.detail}</p>
        </article>
      ))}
    </div>
  ) : null;

  const writeBoundarySection = !isThreadStreamVariant && writeBoundaryCards.length > 0 ? (
    <section className="agent-thought-partner__write-boundary" aria-label="Agent write boundary">
      <div className="agent-thought-partner__drafts-head">
        <h4>Write boundary</h4>
        <p>{writeBoundarySummary?.safetyBoundary?.posture || 'Memory commits stay visible; structure changes stay reviewable.'}</p>
      </div>
      <div className="agent-thought-partner__scorecard">
        {writeBoundaryCards.map((card) => (
          <article key={card.label} className="agent-thought-partner__scorecard-item">
            <span className="agent-thought-partner__scorecard-label">{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>
    </section>
  ) : null;

  const outcomeTelemetrySection = !isThreadStreamVariant && outcomeTelemetryRows.length > 0 ? (
    <section className="agent-thought-partner__write-boundary" aria-label="Agent outcome telemetry">
      <div className="agent-thought-partner__drafts-head">
        <h4>Outcome telemetry</h4>
        <p>Real accept/reject behavior compared with the harness expectation.</p>
      </div>
      <div className="agent-thought-partner__scorecard">
        {outcomeTelemetryRows.map((row) => (
          <article key={row.id} className="agent-thought-partner__scorecard-item">
            <span className="agent-thought-partner__scorecard-label">{row.label}</span>
            <strong>{row.value}</strong>
            <p>{row.status}</p>
            <p>{row.detail}</p>
          </article>
        ))}
      </div>
    </section>
  ) : null;

  const streamPlanPreviewSection = isThreadStreamVariant && streamPlanPreview ? (
    <section className="agent-thought-partner__plan-preview">
      <div className="agent-thought-partner__plan-preview-head">
        <div>
          <span className="agent-thought-partner__plan-preview-eyebrow">{streamPlanPreview.eyebrow}</span>
          <strong className="agent-thought-partner__plan-preview-status">
            {streamPlanPreview.proposalBundle ? 'Waiting for your approval' : 'Working plan'}
          </strong>
        </div>
        {streamPlanPreview.meta.length > 0 && (
          <div className="agent-thought-partner__plan-preview-meta">
            {streamPlanPreview.meta.map((item) => (
              <span key={`${streamPlanPreview.title}-${item}`}>{item}</span>
            ))}
          </div>
        )}
      </div>
      <h4>{streamPlanPreview.title}</h4>
      {clean(streamPlanPreview.summary) && <p>{streamPlanPreview.summary}</p>}
      {streamPlanPreview.bullets.length > 0 && (
        <ol className="agent-thought-partner__plan-preview-list">
          {streamPlanPreview.bullets.map((item) => (
            <li key={`${streamPlanPreview.title}-${item}`}>{item}</li>
          ))}
        </ol>
      )}
      {(streamPlanPreview.proposalBundle || streamPlanPreview.hasReviewStage) && (
        <div className="agent-thought-partner__plan-preview-actions">
          {streamPlanPreview.hasReviewStage && (
            <QuietButton
              type="button"
              onClick={handleFocusReviewStage}
              disabled={loading || disabled}
            >
              Review/edit plan
            </QuietButton>
          )}
          {streamPlanPreview.proposalBundle && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleExecuteProposalBundle(streamPlanPreview.proposalBundle)}
              disabled={loading || disabled}
            >
              Execute plan
            </Button>
          )}
        </div>
      )}
    </section>
  ) : null;

  const proposalBundlesSection = !isThreadStreamVariant && proposalBundles.length > 0 ? (
    <div className="agent-thought-partner__drafts">
      <div className="agent-thought-partner__drafts-head">
        <h4>Pending proposal bundles</h4>
        <p>Executable bundles the agent has proposed and the thread is still holding onto.</p>
      </div>
      {proposalBundles.map((bundle) => (
        <article key={bundle.bundleId} className={`agent-thought-partner__draft-card is-${bundle.status || 'pending'}`}>
          <div className="agent-thought-partner__draft-meta">
            <span>proposal bundle</span>
            <span>{bundle.status || 'pending'}</span>
          </div>
          <h4>{bundle.title || 'Untitled proposal bundle'}</h4>
          {clean(bundle.summary) && (
            <p className="agent-thought-partner__draft-summary">{bundle.summary}</p>
          )}
          <ol className="agent-thought-partner__draft-workflow-steps">
            {(Array.isArray(bundle.operations) ? bundle.operations : []).map((operation) => (
              <li key={`${bundle.bundleId}-${operation.opId || operation.title}`}>
                {operation.title}
              </li>
            ))}
          </ol>
          {clean(bundle.status).toLowerCase() === 'pending' && (
            <div className="agent-thought-partner__draft-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleExecuteProposalBundle(bundle)}
                disabled={loading || disabled}
              >
                Execute plan
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  ) : null;

  const runsSection = !isThreadStreamVariant && runs.length > 0 ? (
    <div className="agent-thought-partner__drafts">
      <div className="agent-thought-partner__drafts-head">
        <h4>Runs</h4>
        <p>Completed and in-flight execution runs for this thread.</p>
      </div>
      {runs.map((run) => (
        <article key={run.runId} className={`agent-thought-partner__draft-card is-${run.status || 'pending'}`}>
          <div className="agent-thought-partner__draft-meta">
            <span>run</span>
            <span>{run.status || 'pending'}</span>
          </div>
          <h4>{run.title || 'Untitled run'}</h4>
          <p className="agent-thought-partner__draft-summary">
            {run.completedStepCount} of {run.steps.length} steps applied.
          </p>
          <ol className="agent-thought-partner__draft-workflow-steps">
            {run.steps.map((step) => (
              <li key={`${run.runId}-${step.opId || step.title}`}>
                <strong>{step.title}</strong>
                {step.status ? ` (${step.status})` : ''}
                {clean(describeRunStepResult(step)) ? ` ${describeRunStepResult(step)}` : ''}
              </li>
            ))}
          </ol>
        </article>
      ))}
    </div>
  ) : null;

  const protocolApprovalsSection = (runApprovalModel.protocolApprovalsLoading
    || clean(runApprovalModel.protocolApprovalsError)
    || (Array.isArray(runApprovalModel.protocolApprovals) && runApprovalModel.protocolApprovals.length > 0)) ? (
      <ProtocolApprovalsPanel
        approvalsModel={runApprovalModel}
        title="Run approvals"
        subtitle="Risky run steps pause here until you approve or reject them."
        emptyText="No pending run approvals."
        className="agent-thought-partner__drafts"
      />
    ) : null;

  const memoryApprovalsSection = (memoryApprovalModel.protocolApprovalsLoading
    || clean(memoryApprovalModel.protocolApprovalsError)
    || (Array.isArray(memoryApprovalModel.protocolApprovals) && memoryApprovalModel.protocolApprovals.length > 0)) ? (
      <ProtocolApprovalsPanel
        approvalsModel={memoryApprovalModel}
        title="Memory approvals"
        subtitle="Memory steward updates wait here before they become working-memory commits."
        emptyText="No pending memory approvals."
        className="agent-thought-partner__drafts"
      />
    ) : null;

  const reviewStageSection = (pendingProposedChanges.length > 0 || pendingStructureProposals.length > 0) ? (
    <div className="agent-thought-partner__drafts agent-thought-partner__drafts--review">
      <div className="agent-thought-partner__drafts-head">
        <h4>{pendingStructureProposals.length > 0 ? 'Organization plan' : 'Review stage'}</h4>
        <p>
          {pendingStructureProposals.length > 0
            ? 'Review the cleanup plan before the agent changes the workspace structure.'
            : 'Agent-authored edits waiting on your decision before they become live workspace changes.'}
        </p>
      </div>
      {pendingStructureProposals.map((proposal) => (
        <StructureProposalReview
          key={proposal.structureProposalId}
          proposal={proposal}
          isLoading={structureProposalLoadingId === proposal.structureProposalId}
          activeOperationId={structureProposalOperationLoadingId}
          onApply={handleApplyStructureProposal}
          onReject={handleRejectStructureProposal}
          onUpdateOperationStatus={handleUpdateStructureProposalOperationStatus}
          onBulkUpdateOperationStatus={handleBulkUpdateStructureProposalOperationStatus}
        />
      ))}
      {pendingProposedChanges.map((change) => (
        <article key={change.proposedChangeId} className={`agent-thought-partner__review-card is-${change.status || 'pending'}`}>
          <div className="agent-thought-partner__review-head">
            <div>
              <div className="agent-thought-partner__draft-meta">
                <span>{change.targetType || 'change'}</span>
                <span>{formatStatusLabel(change.status)}</span>
              </div>
              <h4>{change.targetTitle || 'Untitled target'}</h4>
            </div>
            {Array.isArray(change?.diffSummary?.changedFields) && change.diffSummary.changedFields.length > 0 && (
              <div className="agent-thought-partner__draft-meta">
                {change.diffSummary.changedFields.map((field) => (
                  <span key={`${change.proposedChangeId}-${field}`}>{field}</span>
                ))}
              </div>
            )}
          </div>
          {clean(change.summary) && (
            <p className="agent-thought-partner__draft-summary">{change.summary}</p>
          )}
          {editingProposedChangeId === change.proposedChangeId ? (
            <div className="agent-thought-partner__draft-editor">
              <label className="agent-thought-partner__draft-field">
                <span>Proposed text</span>
                <textarea
                  value={editingProposedChangeText}
                  onChange={(event) => setEditingProposedChangeText(event.target.value)}
                  rows={6}
                  disabled={proposedChangeLoadingId === change.proposedChangeId}
                />
              </label>
              <div className="agent-thought-partner__draft-actions">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={proposedChangeLoadingId === change.proposedChangeId}
                  onClick={() => handleSaveProposedChangeEdit(change)}
                >
                  {proposedChangeLoadingId === change.proposedChangeId ? 'Saving…' : 'Save edit'}
                </Button>
                <QuietButton
                  type="button"
                  disabled={proposedChangeLoadingId === change.proposedChangeId}
                  onClick={handleCancelEditProposedChange}
                >
                  Cancel
                </QuietButton>
              </div>
            </div>
          ) : (
            <>
              <div className="agent-thought-partner__snapshot-grid">
                <section className="agent-thought-partner__snapshot-card">
                  <span className="agent-thought-partner__snapshot-label">Current</span>
                  <p>{getSnapshotText(change.currentSnapshot) || 'No existing text on this object.'}</p>
                </section>
                <section className="agent-thought-partner__snapshot-card is-proposed">
                  <span className="agent-thought-partner__snapshot-label">Proposed</span>
                  <p>{getSnapshotText(change.proposedSnapshot) || 'No proposed text.'}</p>
                </section>
              </div>
              <div className="agent-thought-partner__draft-actions">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={proposedChangeLoadingId === change.proposedChangeId || clean(change.status).toLowerCase() !== 'pending'}
                  onClick={() => handleAcceptProposedChange(change.proposedChangeId)}
                >
                  {proposedChangeLoadingId === change.proposedChangeId ? 'Applying…' : 'Accept'}
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={proposedChangeLoadingId === change.proposedChangeId || clean(change.status).toLowerCase() !== 'pending'}
                  onClick={() => handleStartEditProposedChange(change)}
                >
                  Edit before accept
                </Button>
                <QuietButton
                  type="button"
                  disabled={proposedChangeLoadingId === change.proposedChangeId || clean(change.status).toLowerCase() !== 'pending'}
                  onClick={() => handleRejectProposedChange(change.proposedChangeId)}
                >
                  Reject
                </QuietButton>
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  ) : null;

  const appliedHistorySection = (resolvedProposedChanges.length > 0 || resolvedStructureProposals.length > 0) ? (
    <div className="agent-thought-partner__drafts agent-thought-partner__drafts--history">
      <div className="agent-thought-partner__drafts-head">
        <h4>Applied history</h4>
        <p>Accepted changes and structure plans stay reversible here, so agent work remains visible after it lands.</p>
      </div>
      {resolvedStructureProposals.map((proposal) => (
        <StructureProposalReview
          key={proposal.structureProposalId}
          proposal={proposal}
          isLoading={structureProposalLoadingId === proposal.structureProposalId}
          activeOperationId={structureProposalOperationLoadingId}
          onRollback={handleRollbackStructureProposal}
        />
      ))}
      {resolvedProposedChanges.map((change) => {
        const status = clean(change.status).toLowerCase();
        const isApplied = status === 'applied';
        const timelineLabel = change.rolledBackAt
          ? `Rolled back ${formatDateTime(change.rolledBackAt)}`
          : change.acceptedAt
            ? `Applied ${formatDateTime(change.acceptedAt)}`
            : change.rejectedAt
              ? `Rejected ${formatDateTime(change.rejectedAt)}`
              : '';
        return (
          <article key={change.proposedChangeId} className={`agent-thought-partner__review-card is-history is-${change.status || 'pending'}`}>
            <div className="agent-thought-partner__review-head">
              <div>
                <div className="agent-thought-partner__draft-meta">
                  <span>{change.targetType || 'change'}</span>
                  <span>{formatStatusLabel(change.status)}</span>
                </div>
                <h4>{change.targetTitle || 'Untitled target'}</h4>
              </div>
              {timelineLabel && (
                <p className="agent-thought-partner__history-timestamp">{timelineLabel}</p>
              )}
            </div>
            {clean(change.summary) && (
              <p className="agent-thought-partner__draft-summary">{change.summary}</p>
            )}
            <div className="agent-thought-partner__snapshot-grid">
              <section className="agent-thought-partner__snapshot-card">
                <span className="agent-thought-partner__snapshot-label">Before</span>
                <p>{getSnapshotText(change.currentSnapshot) || 'No stored pre-change text.'}</p>
              </section>
              <section className="agent-thought-partner__snapshot-card is-proposed">
                <span className="agent-thought-partner__snapshot-label">Applied</span>
                <p>{getSnapshotText(change.proposedSnapshot) || 'No applied text.'}</p>
              </section>
            </div>
            {isApplied && (
              <div className="agent-thought-partner__draft-actions">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={proposedChangeLoadingId === change.proposedChangeId}
                  onClick={() => handleRollbackProposedChange(change.proposedChangeId)}
                >
                  {proposedChangeLoadingId === change.proposedChangeId ? 'Rolling back…' : 'Roll back'}
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  ) : null;

  const artifactDraftsSection = !isThreadStreamVariant && visibleArtifactDrafts.length > 0 ? (
    <div className="agent-thought-partner__drafts">
      <div className="agent-thought-partner__drafts-head">
        <h4>Draft artifacts</h4>
        <p>Agent-created outputs you can promote into real workspace objects.</p>
      </div>
      {visibleArtifactDrafts.map((draft) => {
        const isLoadingDraft = artifactDraftLoadingId === draft.draftId;
        const workflowSteps = Array.isArray(draft?.skill?.workflow?.steps) ? draft.skill.workflow.steps.slice(0, 4) : [];
        const nextSkills = Array.isArray(draft?.skill?.workflow?.nextSkills) ? draft.skill.workflow.nextSkills.slice(0, 3) : [];
        return (
          <article key={draft.draftId} className={`agent-thought-partner__draft-card is-${draft.status || 'pending'}`}>
            <div className="agent-thought-partner__draft-meta">
              <span>{draft.artifactType || 'draft'}</span>
              <span>{draft.status || 'pending'}</span>
            </div>
            <h4>{draft.title || 'Untitled draft'}</h4>
            <p className="agent-thought-partner__draft-summary">{draft.summary || draft.body.slice(0, 220)}</p>
            {workflowSteps.length > 0 && (
              <div className="agent-thought-partner__draft-workflow">
                <div className="agent-thought-partner__draft-workflow-head">
                  <span>{clean(draft?.skill?.workflow?.label) || 'Workflow'}</span>
                  <span>{workflowSteps.length} steps</span>
                </div>
                {(formatWorkflowTrack(draft?.skill?.workflow) || formatWorkflowCadence(draft?.skill?.workflow)) && (
                  <div className="agent-thought-partner__draft-meta">
                    {formatWorkflowTrack(draft?.skill?.workflow) && <span>{formatWorkflowTrack(draft?.skill?.workflow)}</span>}
                    {formatWorkflowCadence(draft?.skill?.workflow) && <span>{formatWorkflowCadence(draft?.skill?.workflow)}</span>}
                  </div>
                )}
                <ol className="agent-thought-partner__draft-workflow-steps">
                  {workflowSteps.map((step, index) => (
                    <li key={`${draft.draftId}-workflow-${index}`}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
            {editingDraftId === draft.draftId && draft.status !== 'promoted' && (
              <div className="agent-thought-partner__draft-editor">
                <label className="agent-thought-partner__draft-field">
                  <span>Title</span>
                  <input
                    type="text"
                    value={editingDraftTitle}
                    onChange={(event) => setEditingDraftTitle(event.target.value)}
                    disabled={isLoadingDraft}
                  />
                </label>
                <label className="agent-thought-partner__draft-field">
                  <span>Summary</span>
                  <textarea
                    value={editingDraftSummary}
                    onChange={(event) => setEditingDraftSummary(event.target.value)}
                    rows={2}
                    disabled={isLoadingDraft}
                  />
                </label>
                <label className="agent-thought-partner__draft-field">
                  <span>Body</span>
                  <textarea
                    value={editingDraftBody}
                    onChange={(event) => setEditingDraftBody(event.target.value)}
                    rows={8}
                    disabled={isLoadingDraft}
                  />
                </label>
                <div className="agent-thought-partner__draft-actions">
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={isLoadingDraft || !clean(editingDraftTitle) || !clean(editingDraftBody)}
                    onClick={() => handleSaveEditDraft(draft.draftId)}
                  >
                    {isLoadingDraft ? 'Saving…' : 'Save revision'}
                  </Button>
                  <QuietButton
                    type="button"
                    disabled={isLoadingDraft}
                    onClick={handleCancelEditDraft}
                  >
                    Cancel
                  </QuietButton>
                </div>
              </div>
            )}
            {draft.promotedTo?.path ? (
              <a href={draft.promotedTo.path} className="agent-thought-partner__related-link">
                Open {draft.promotedTo.title || draft.promotedTo.type || 'artifact'}
              </a>
            ) : editingDraftId !== draft.draftId ? (
              <div className="agent-thought-partner__draft-actions">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={isLoadingDraft}
                  onClick={() => handleStartEditDraft(draft)}
                >
                  {isLoadingDraft ? 'Working…' : 'Revise'}
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={isLoadingDraft}
                  onClick={() => handlePromoteDraft(draft.draftId)}
                >
                  {isLoadingDraft ? 'Applying…' : 'Promote'}
                </Button>
                <QuietButton
                  type="button"
                  disabled={isLoadingDraft}
                  onClick={() => handleDismissDraft(draft.draftId)}
                >
                  Dismiss
                </QuietButton>
              </div>
            ) : null}
            {editingDraftId !== draft.draftId && nextSkills.length > 0 && (
              <div className="agent-thought-partner__draft-continuations">
                <span className="agent-thought-partner__draft-continuations-label">Continue with</span>
                <div className="agent-thought-partner__draft-actions">
                  {nextSkills.map((skill) => (
                    <Button
                      key={`${draft.draftId}-${skill.id}`}
                      variant="secondary"
                      type="button"
                      disabled={isLoadingDraft}
                      onClick={() => handleContinueWorkflowDraft(draft, skill)}
                    >
                      {skill.title}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  ) : null;

  return (
    <SurfaceCard
      className={`agent-thought-partner ${isStreamVariant ? 'agent-thought-partner--stream' : ''} ${isPassiveNotebookPosture ? 'agent-thought-partner--passive' : ''} ${className}`.trim()}
      data-testid="thought-partner-panel"
      data-agent-posture={activePostureValue || undefined}
    >
      <AgentPresence
        className={`agent-thought-partner__presence ${isStreamVariant ? 'agent-thought-partner__presence--stream' : ''}`.trim()}
        status={loading ? 'maintaining' : 'idle'}
        title={title}
        subtitle={partnerSubtitle}
        actionLabel="Clear"
        actionDisabled={loading || disabled || messages.length === 0}
        onAction={handleClearPanel}
        actionTestId="thought-partner-clear"
      />

      {postureControlSection}
      <AgentTicker
        className="agent-thought-partner__ticker"
        label={`${AGENT_DISPLAY_NAME} computation trace`}
        lines={tickerLines}
        state={tickerState}
        sharedMemory
        surface={contextTitle || contextType || 'Thought partner'}
      />
      {isPassiveNotebookPosture ? (
        <p className="agent-thought-partner__passive-status" data-testid="thought-partner-passive-status">
          {passiveStatusText}
        </p>
      ) : null}
      {showQuickPrompts && !isThreadStreamVariant && !isPassiveNotebookPosture && quickPromptsSection}
      {plannerStripSection}
      {scorecardSection}
      {modelComparisonSection}
      {writeBoundarySection}
      {outcomeTelemetrySection}
      {streamPlanPreviewSection}

      <form className={`agent-thought-partner__composer ${isStreamVariant ? 'agent-thought-partner__composer--stream' : ''}`.trim()} onSubmit={handleComposerSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={placeholder}
          rows={3}
          disabled={loading || disabled}
        />
        <Button
          variant="secondary"
          type="submit"
          className={isStreamVariant ? 'agent-thought-partner__submit' : ''}
          disabled={loading || disabled || !clean(input)}
        >
          {loading ? 'Thinking…' : submitLabel}
        </Button>
      </form>

      {error && <p className="status-message error-message">{error}</p>}
      {!error && messages.length === 0 && (
        <p className="muted small">{emptyStateText}</p>
      )}

      <div className="agent-thought-partner__thread" ref={threadViewportRef}>
        {visibleMessages.map((message) => (
          <div
            key={message.id}
            className={`agent-thought-partner__message ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}`}
          >
            <p className="agent-thought-partner__message-role">{message.role === 'assistant' ? AGENT_DISPLAY_NAME : 'You'}</p>
            <p>{message.text}</p>
            {message.role === 'assistant' && message.proposalBundle && (
              <div className="agent-thought-partner__draft-workflow">
                <div className="agent-thought-partner__draft-workflow-head">
                  <span>{message.proposalBundle.title || 'Proposed bundle'}</span>
                  <span>{message.proposalBundle.status || 'pending'}</span>
                </div>
                {clean(message.proposalBundle.summary) && (
                  <p className="agent-thought-partner__draft-summary">{message.proposalBundle.summary}</p>
                )}
                <ol className="agent-thought-partner__draft-workflow-steps">
                  {(Array.isArray(message.proposalBundle.operations) ? message.proposalBundle.operations : []).map((operation) => (
                    <li key={`${message.id}-${operation.opId || operation.title}`}>
                      {operation.title}
                    </li>
                  ))}
                </ol>
                {clean(message.proposalBundle.status).toLowerCase() === 'pending' && (
                  <div className="agent-thought-partner__draft-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleExecuteProposalBundle(message.proposalBundle)}
                      disabled={loading || disabled}
                    >
                      Execute plan
                    </Button>
                  </div>
                )}
              </div>
            )}
            {message.role === 'assistant' && Array.isArray(message.relatedItems) && message.relatedItems.length > 0 && (
              <div className="agent-thought-partner__related-items">
                {message.relatedItems.slice(0, 6).map((item) => {
                  const path = toItemPath(item);
                  const title = clean(item.title) || `${clean(item.type) || 'item'} ${clean(item.id)}`;
                  return path ? (
                    <a key={`${item.type}:${item.id}`} href={path} className="agent-thought-partner__related-link">
                      {title}
                    </a>
                  ) : (
                    <span key={`${item.type}:${item.id}`} className="agent-thought-partner__related-label">
                      {title}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {isThreadStreamVariant && reviewStageSection}
      {isThreadStreamVariant && protocolApprovalsSection}
      {isThreadStreamVariant && memoryApprovalsSection}
      {isThreadStreamVariant && quickPromptsSection}
      {isThreadStreamVariant && appliedHistorySection}
      {!isThreadStreamVariant && proposalBundlesSection}
      {!isThreadStreamVariant && runsSection}
      {!isThreadStreamVariant && protocolApprovalsSection}
      {!isThreadStreamVariant && memoryApprovalsSection}
      {!isThreadStreamVariant && reviewStageSection}
      {!isThreadStreamVariant && appliedHistorySection}
      {!isThreadStreamVariant && artifactDraftsSection}

      {lastAssistantMessage && lastAssistantMessage.premiumWebResearchAvailable === false && (
        <p className="muted small">
          External web research is a premium capability and is not enabled yet.
        </p>
      )}
    </SurfaceCard>
  );
};

export default ThoughtPartnerPanel;
