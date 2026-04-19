import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptAgentProposedChange,
  chatWithAgent,
  dismissAgentArtifactDraft,
  getAgentHarnessMetrics,
  listAgentProposedChanges,
  listAgentRuns,
  listAgentArtifactDrafts,
  promoteAgentArtifactDraft,
  rejectAgentProposedChange,
  rollbackAgentProposedChange,
  updateAgentProposedChange,
  updateAgentArtifactDraft
} from '../../api/agent';
import { Button, QuietButton, SectionHeader, SurfaceCard } from '../ui';
import { buildCanonicalArticlePath } from '../../utils/firstInsight';
import { buildQueuedAgentSkillPrompt } from '../../utils/agentSkillInvocation';
import useProtocolApprovals from '../../hooks/useProtocolApprovals';
import ProtocolApprovalsPanel from './ProtocolApprovalsPanel';

const clean = (value) => String(value || '').trim();
const truncate = (value, limit = 320) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

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

const mapThreadMessages = (thread = null) => (
  Array.isArray(thread?.messages)
    ? thread.messages.map((message, index) => ({
        id: `${clean(thread?.threadId) || 'thread'}-${message?.createdAt || index}-${index}`,
        role: clean(message?.role).toLowerCase() === 'assistant' ? 'assistant' : 'user',
        text: clean(message?.text),
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
  placeholder = 'Ask your thought partner…',
  className = '',
  title = 'Thought partner',
  subtitle = '',
  promptTemplates: promptTemplatesProp = null,
  emptyStateText = 'Start with a question, or pick a prompt above.',
  submitLabel = 'Ask',
  variant = 'default',
  thread = null,
  onThreadChange = null,
  queuedPrompt = null,
  contextMetadata = null,
  disabled = false
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState('');
  const [artifactDrafts, setArtifactDrafts] = useState([]);
  const [proposalBundles, setProposalBundles] = useState([]);
  const [runs, setRuns] = useState([]);
  const [proposedChanges, setProposedChanges] = useState([]);
  const [harnessMetrics, setHarnessMetrics] = useState(null);
  const [proposedChangeLoadingId, setProposedChangeLoadingId] = useState('');
  const [editingProposedChangeId, setEditingProposedChangeId] = useState('');
  const [editingProposedChangeText, setEditingProposedChangeText] = useState('');
  const [artifactDraftLoadingId, setArtifactDraftLoadingId] = useState('');
  const [editingDraftId, setEditingDraftId] = useState('');
  const [editingDraftTitle, setEditingDraftTitle] = useState('');
  const [editingDraftSummary, setEditingDraftSummary] = useState('');
  const [editingDraftBody, setEditingDraftBody] = useState('');
  const [pendingSkillInvocation, setPendingSkillInvocation] = useState(null);
  const handledQueuedPromptIdRef = useRef('');
  const activeThreadId = clean(threadId || thread?.threadId);

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

  const loadProposedChanges = useCallback(async (nextThreadId) => {
    const safeThreadId = clean(nextThreadId);
    if (!safeThreadId) {
      setProposedChanges([]);
      return;
    }
    try {
      const result = await listAgentProposedChanges({ threadId: safeThreadId, status: 'all' });
      setProposedChanges(Array.isArray(result?.proposedChanges) ? result.proposedChanges.map(mapProposedChange) : []);
    } catch (_error) {
      // Keep the panel usable even if proposed change hydration fails.
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
      await loadHarnessMetrics(activeThreadId);
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
      text: message
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
      const hydratedMessages = result?.thread?.threadId ? mapThreadMessages(result.thread) : [];
      const didHydrateThread = Boolean(result?.thread?.threadId && hydratedMessages.length > 0);
      if (result?.thread?.threadId) {
        hydrateFromThread(result.thread);
        loadArtifactDrafts(result.thread.threadId);
        loadRuns(result.thread.threadId);
        loadProposedChanges(result.thread.threadId);
        loadHarnessMetrics(result.thread.threadId);
        if (typeof onThreadChange === 'function') onThreadChange(result.thread);
      }
      const assistantMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        text: clean(result?.reply) || 'No reply generated.',
        relatedItems: Array.isArray(result?.relatedItems) ? result.relatedItems : [],
        premiumWebResearchAvailable: Boolean(result?.premiumWebResearchAvailable),
        proposalBundle: result?.proposalBundle && typeof result.proposalBundle === 'object'
          ? result.proposalBundle
          : null,
        planner: result?.planner && typeof result.planner === 'object' ? result.planner : null
      };
      if (!didHydrateThread) {
        setMessages(prev => [...prev, assistantMessage]);
      }
      if (result?.draftArtifact?.draftId) {
        setArtifactDrafts(prev => {
          const nextDraft = mapDraft(result.draftArtifact);
          const remaining = prev.filter((entry) => entry.draftId !== nextDraft.draftId);
          return [nextDraft, ...remaining];
        });
      }
      setPendingSkillInvocation(null);
    } catch (chatError) {
      setError(chatError.response?.data?.error || 'Failed to ask agent.');
    } finally {
      setLoading(false);
    }
  }, [context, contextTitle, disabled, hydrateFromThread, loadArtifactDrafts, loadHarnessMetrics, loadProposedChanges, loadRuns, loading, messages, onThreadChange, pendingSkillInvocation, thread?.threadId, thread?.title, threadId, title]);

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
    setProposedChanges([]);
    setHarnessMetrics(null);
    setProposedChangeLoadingId('');
    setEditingProposedChangeId('');
    setEditingProposedChangeText('');
    setEditingDraftId('');
    setEditingDraftTitle('');
    setEditingDraftSummary('');
    setEditingDraftBody('');
    setPendingSkillInvocation(null);
    setError('');
  }, [contextId, contextType, hydrateFromThread, thread]);

  useEffect(() => {
    if (!activeThreadId) return;
    loadArtifactDrafts(activeThreadId);
    loadRuns(activeThreadId);
    loadProposedChanges(activeThreadId);
    loadHarnessMetrics(activeThreadId);
  }, [activeThreadId, loadArtifactDrafts, loadHarnessMetrics, loadProposedChanges, loadRuns]);

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
        const nextChange = mapProposedChange(result.proposedChange);
        setProposedChanges(prev => prev.map((entry) => (
          entry.proposedChangeId === nextChange.proposedChangeId ? nextChange : entry
        )));
        handleCancelEditProposedChange();
      }
    } catch (updateError) {
      setError(updateError.response?.data?.error || 'Failed to update proposed change.');
    } finally {
      setProposedChangeLoadingId('');
    }
  }, [editingProposedChangeText, handleCancelEditProposedChange]);

  const handleAcceptProposedChange = useCallback(async (proposedChangeId) => {
    const safeId = clean(proposedChangeId);
    if (!safeId) return;
    setProposedChangeLoadingId(safeId);
    try {
      const result = await acceptAgentProposedChange(safeId);
      if (result?.proposedChange) {
        const nextChange = mapProposedChange(result.proposedChange);
        setProposedChanges(prev => prev.map((entry) => (
          entry.proposedChangeId === nextChange.proposedChangeId ? nextChange : entry
        )));
        if (activeThreadId) {
          await loadRuns(activeThreadId);
          await loadHarnessMetrics(activeThreadId);
        }
      }
    } catch (acceptError) {
      setError(acceptError.response?.data?.error || 'Failed to accept proposed change.');
    } finally {
      setProposedChangeLoadingId('');
    }
  }, [activeThreadId, loadHarnessMetrics, loadRuns]);

  const handleRejectProposedChange = useCallback(async (proposedChangeId) => {
    const safeId = clean(proposedChangeId);
    if (!safeId) return;
    setProposedChangeLoadingId(safeId);
    try {
      const result = await rejectAgentProposedChange(safeId);
      if (result?.proposedChange) {
        const nextChange = mapProposedChange(result.proposedChange);
        setProposedChanges(prev => prev.map((entry) => (
          entry.proposedChangeId === nextChange.proposedChangeId ? nextChange : entry
        )));
        if (activeThreadId) {
          await loadRuns(activeThreadId);
          await loadHarnessMetrics(activeThreadId);
        }
      }
    } catch (rejectError) {
      setError(rejectError.response?.data?.error || 'Failed to reject proposed change.');
    } finally {
      setProposedChangeLoadingId('');
    }
  }, [activeThreadId, loadHarnessMetrics, loadRuns]);

  const handleRollbackProposedChange = useCallback(async (proposedChangeId) => {
    const safeId = clean(proposedChangeId);
    if (!safeId) return;
    setProposedChangeLoadingId(safeId);
    try {
      const result = await rollbackAgentProposedChange(safeId);
      if (result?.proposedChange) {
        const nextChange = mapProposedChange(result.proposedChange);
        setProposedChanges(prev => prev.map((entry) => (
          entry.proposedChangeId === nextChange.proposedChangeId ? nextChange : entry
        )));
        if (activeThreadId) {
          await loadRuns(activeThreadId);
          await loadHarnessMetrics(activeThreadId);
        }
      }
    } catch (rollbackError) {
      setError(rollbackError.response?.data?.error || 'Failed to roll back proposed change.');
    } finally {
      setProposedChangeLoadingId('');
    }
  }, [activeThreadId, loadHarnessMetrics, loadRuns]);

  const lastAssistantMessage = useMemo(() => (
    [...messages].reverse().find(entry => entry.role === 'assistant') || null
  ), [messages]);
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
  const pendingProposedChanges = useMemo(
    () => proposedChanges.filter((change) => clean(change.status).toLowerCase() === 'pending'),
    [proposedChanges]
  );
  const resolvedProposedChanges = useMemo(
    () => proposedChanges.filter((change) => clean(change.status).toLowerCase() !== 'pending'),
    [proposedChanges]
  );
  const harnessStats = useMemo(() => {
    if (!harnessMetrics || typeof harnessMetrics !== 'object') return [];
    return [
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
        value: String(Number(harnessMetrics?.proposedChangeStatuses?.pending || 0)),
        detail: 'Pending user-owned edits'
      },
      {
        label: 'Draft fallback',
        value: String(Number(harnessMetrics?.funnel?.draftFallbacks || 0)),
        detail: 'Replies that still staged drafts'
      }
    ];
  }, [harnessMetrics]);
  const isStreamVariant = variant === 'stream';
  const partnerSubtitle = subtitle || (contextTitle ? `Context: ${contextTitle}` : 'Ask about your notes, concepts, and articles.');

  return (
    <SurfaceCard className={`agent-thought-partner ${isStreamVariant ? 'agent-thought-partner--stream' : ''} ${className}`.trim()} data-testid="thought-partner-panel">
      {isStreamVariant ? (
        <div className="agent-thought-partner__stream-head">
          <div className="agent-thought-partner__stream-copy">
            <h3>{title}</h3>
            <p>{partnerSubtitle}</p>
          </div>
          <QuietButton
            type="button"
            onClick={() => {
              setMessages([]);
              setThreadId('');
              setArtifactDrafts([]);
              setProposalBundles([]);
              setRuns([]);
              setProposedChanges([]);
              setProposedChangeLoadingId('');
              setEditingProposedChangeId('');
              setEditingProposedChangeText('');
              setEditingDraftId('');
              setEditingDraftTitle('');
              setEditingDraftSummary('');
              setEditingDraftBody('');
              setPendingSkillInvocation(null);
            }}
            disabled={loading || disabled || messages.length === 0}
          >
            Clear
          </QuietButton>
        </div>
      ) : (
        <SectionHeader
          title={title}
          subtitle={partnerSubtitle}
          action={(
            <QuietButton
              type="button"
              onClick={() => {
                setMessages([]);
                setThreadId('');
                setArtifactDrafts([]);
                setProposalBundles([]);
                setRuns([]);
                setProposedChanges([]);
                setProposedChangeLoadingId('');
                setEditingProposedChangeId('');
                setEditingProposedChangeText('');
                setEditingDraftId('');
                setEditingDraftTitle('');
                setEditingDraftSummary('');
                setEditingDraftBody('');
                setPendingSkillInvocation(null);
              }}
              disabled={loading || messages.length === 0}
            >
              Clear
            </QuietButton>
          )}
        />
      )}

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

      {activePlanner && (
        <div className="agent-thought-partner__planner-strip">
          <div className="agent-thought-partner__planner-pill">
            <span className="agent-thought-partner__planner-label">Active specialist</span>
            <strong>{activePlanner.activeWorkerLabel || formatWorkerRole(activePlanner.activeWorkerRole) || 'Planner'}</strong>
          </div>
          {clean(activePlanner.rationale) && (
            <p className="agent-thought-partner__planner-copy">{activePlanner.rationale}</p>
          )}
        </div>
      )}

      {harnessStats.length > 0 && (
        <div className="agent-thought-partner__scorecard">
          {harnessStats.map((stat) => (
            <article key={stat.label} className="agent-thought-partner__scorecard-item">
              <span className="agent-thought-partner__scorecard-label">{stat.label}</span>
              <strong>{stat.value}</strong>
              <p>{stat.detail}</p>
            </article>
          ))}
        </div>
      )}

      <div className={`agent-thought-partner__composer ${isStreamVariant ? 'agent-thought-partner__composer--stream' : ''}`.trim()}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          rows={3}
          disabled={loading || disabled}
        />
        <Button
          variant="secondary"
          type="button"
          className={isStreamVariant ? 'agent-thought-partner__submit' : ''}
          onClick={() => submitMessage(input)}
          disabled={loading || disabled || !clean(input)}
        >
          {loading ? 'Thinking…' : submitLabel}
        </Button>
      </div>

      {error && <p className="status-message error-message">{error}</p>}
      {!error && messages.length === 0 && (
        <p className="muted small">{emptyStateText}</p>
      )}

      <div className="agent-thought-partner__thread">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`agent-thought-partner__message ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}`}
          >
            <p className="agent-thought-partner__message-role">{message.role === 'assistant' ? 'Agent' : 'You'}</p>
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

      {proposalBundles.length > 0 && (
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
            </article>
          ))}
        </div>
      )}

      {runs.length > 0 && (
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
      )}

      {(runApprovalModel.protocolApprovalsLoading
        || clean(runApprovalModel.protocolApprovalsError)
        || (Array.isArray(runApprovalModel.protocolApprovals) && runApprovalModel.protocolApprovals.length > 0)) && (
        <ProtocolApprovalsPanel
          approvalsModel={runApprovalModel}
          title="Run approvals"
          subtitle="Risky run steps pause here until you approve or reject them."
          emptyText="No pending run approvals."
          className="agent-thought-partner__drafts"
        />
      )}

      {pendingProposedChanges.length > 0 && (
        <div className="agent-thought-partner__drafts agent-thought-partner__drafts--review">
          <div className="agent-thought-partner__drafts-head">
            <h4>Review stage</h4>
            <p>Agent-authored patches waiting on your decision before they become part of the live workspace.</p>
          </div>
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
      )}

      {resolvedProposedChanges.length > 0 && (
        <div className="agent-thought-partner__drafts agent-thought-partner__drafts--history">
          <div className="agent-thought-partner__drafts-head">
            <h4>Applied history</h4>
            <p>Accepted changes stay reversible here, so agent edits remain visible after they land.</p>
          </div>
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
      )}

      {visibleArtifactDrafts.length > 0 && (
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
      )}

      {lastAssistantMessage && lastAssistantMessage.premiumWebResearchAvailable === false && (
        <p className="muted small">
          External web research is a premium capability and is not enabled yet.
        </p>
      )}
    </SurfaceCard>
  );
};

export default ThoughtPartnerPanel;
