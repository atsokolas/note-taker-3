import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chatWithAgent,
  dismissAgentArtifactDraft,
  listAgentArtifactDrafts,
  promoteAgentArtifactDraft,
  updateAgentArtifactDraft
} from '../../api/agent';
import { Button, QuietButton, SectionHeader, SurfaceCard } from '../ui';
import { buildCanonicalArticlePath } from '../../utils/firstInsight';
import { buildQueuedAgentSkillPrompt } from '../../utils/agentSkillInvocation';

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
  const [artifactDraftLoadingId, setArtifactDraftLoadingId] = useState('');
  const [editingDraftId, setEditingDraftId] = useState('');
  const [editingDraftTitle, setEditingDraftTitle] = useState('');
  const [editingDraftSummary, setEditingDraftSummary] = useState('');
  const [editingDraftBody, setEditingDraftBody] = useState('');
  const [pendingSkillInvocation, setPendingSkillInvocation] = useState(null);
  const handledQueuedPromptIdRef = useRef('');

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
        if (typeof onThreadChange === 'function') onThreadChange(result.thread);
      }
      const assistantMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        text: clean(result?.reply) || 'No reply generated.',
        relatedItems: Array.isArray(result?.relatedItems) ? result.relatedItems : [],
        premiumWebResearchAvailable: Boolean(result?.premiumWebResearchAvailable),
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
  }, [context, contextTitle, disabled, hydrateFromThread, loadArtifactDrafts, loading, messages, onThreadChange, pendingSkillInvocation, thread?.threadId, thread?.title, threadId, title]);

  useEffect(() => {
    if (clean(thread?.threadId)) {
      hydrateFromThread(thread);
      setError('');
      return;
    }
    setMessages([]);
    setThreadId('');
    setArtifactDrafts([]);
    setEditingDraftId('');
    setEditingDraftTitle('');
    setEditingDraftSummary('');
    setEditingDraftBody('');
    setPendingSkillInvocation(null);
    setError('');
  }, [contextId, contextType, hydrateFromThread, thread]);

  useEffect(() => {
    const activeThreadId = clean(threadId || thread?.threadId);
    if (!activeThreadId) return;
    loadArtifactDrafts(activeThreadId);
  }, [loadArtifactDrafts, thread?.threadId, threadId]);

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
