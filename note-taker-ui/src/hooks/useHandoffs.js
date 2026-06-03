import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelAgentHandoff,
  claimAgentHandoff,
  completeAgentHandoff,
  createAgentHandoff,
  createAutoAgentHandoff,
  ensureAgentHandoffThread,
  listAgentHandoffs,
  listPersonalAgents,
  rejectAgentHandoff
} from '../api/agent';
import { AGENT_DISPLAY_NAME, SPECIALIST_AGENT_LABEL, labelForAgentActorType } from '../constants/agentIdentity';

const useHandoffs = ({
  enabled = false,
  selectedHandoffId = '',
  onOpenHandoff = null,
  onOpenThread = null,
  onProtocolApprovalQueued = null,
  personalAgentsOverride = null,
  initialStatusFilter = 'pending'
} = {}) => {
  const [loadedPersonalAgents, setLoadedPersonalAgents] = useState([]);
  const [handoffs, setHandoffs] = useState([]);
  const [handoffsLoading, setHandoffsLoading] = useState(false);
  const [handoffsError, setHandoffsError] = useState('');
  const [handoffStatusFilter, setHandoffStatusFilter] = useState(initialStatusFilter);
  const [queueActorType, setQueueActorType] = useState('user');
  const [queueActorId, setQueueActorId] = useState('');
  const [handoffActionBusyId, setHandoffActionBusyId] = useState('');
  const [handoffActionError, setHandoffActionError] = useState('');
  const [handoffActionInfo, setHandoffActionInfo] = useState('');
  const [newHandoffTitle, setNewHandoffTitle] = useState('');
  const [newHandoffObjective, setNewHandoffObjective] = useState('');
  const [newHandoffTaskType, setNewHandoffTaskType] = useState('research');
  const [newHandoffPriority, setNewHandoffPriority] = useState('normal');
  const [newHandoffDueAt, setNewHandoffDueAt] = useState('');
  const [newHandoffAutoRoute, setNewHandoffAutoRoute] = useState(true);
  const [newHandoffRequestedActorType, setNewHandoffRequestedActorType] = useState('native_agent');
  const [newHandoffRequestedActorId, setNewHandoffRequestedActorId] = useState('');
  const [handoffCreating, setHandoffCreating] = useState(false);
  const [handoffCreateError, setHandoffCreateError] = useState('');
  const [handoffCreateInfo, setHandoffCreateInfo] = useState('');

  const personalAgents = useMemo(
    () => (Array.isArray(personalAgentsOverride) ? personalAgentsOverride : loadedPersonalAgents),
    [loadedPersonalAgents, personalAgentsOverride]
  );

  const sortedPersonalAgents = useMemo(() => (
    [...personalAgents].sort((a, b) => {
      const aTime = new Date(a?.updatedAt || 0).getTime();
      const bTime = new Date(b?.updatedAt || 0).getTime();
      return bTime - aTime;
    })
  ), [personalAgents]);

  const agentNameById = useMemo(() => {
    const map = new Map();
    sortedPersonalAgents.forEach((agent) => {
      map.set(String(agent?._id || ''), String(agent?.name || SPECIALIST_AGENT_LABEL));
    });
    return map;
  }, [sortedPersonalAgents]);

  const activeHandoffData = useMemo(
    () => handoffs.find((row) => String(row?.handoffId || '') === selectedHandoffId) || handoffs[0] || null,
    [handoffs, selectedHandoffId]
  );

  const formatActor = useCallback((actor = {}) => {
    const actorType = String(actor?.actorType || '').trim();
    const actorId = String(actor?.actorId || '').trim();
    if (actorType === 'native_agent') return actorId ? `${AGENT_DISPLAY_NAME} · ${actorId}` : AGENT_DISPLAY_NAME;
    if (actorType === 'byo_agent') return agentNameById.get(actorId) || labelForAgentActorType(actorType, actorId);
    return labelForAgentActorType(actorType, actorId);
  }, [agentNameById]);

  const formatDateTime = useCallback((value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString();
  }, []);

  const loadPersonalAgents = useCallback(async () => {
    try {
      const rows = await listPersonalAgents();
      setLoadedPersonalAgents(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setLoadedPersonalAgents([]);
    }
  }, []);

  const loadHandoffs = useCallback(async () => {
    setHandoffsLoading(true);
    setHandoffsError('');
    try {
      const response = await listAgentHandoffs({
        status: handoffStatusFilter || 'all',
        limit: 80
      });
      setHandoffs(Array.isArray(response?.handoffs) ? response.handoffs : []);
    } catch (error) {
      setHandoffsError(error.response?.data?.error || 'Failed to load handoffs.');
      setHandoffs([]);
    } finally {
      setHandoffsLoading(false);
    }
  }, [handoffStatusFilter]);

  useEffect(() => {
    if (!enabled || Array.isArray(personalAgentsOverride)) return;
    loadPersonalAgents();
  }, [enabled, loadPersonalAgents, personalAgentsOverride]);

  useEffect(() => {
    if (!enabled) return;
    loadHandoffs();
  }, [enabled, loadHandoffs]);

  const resolveQueueActorPayload = useCallback(() => {
    const actorType = String(queueActorType || 'user').trim();
    if (actorType === 'user') return { actorType: 'user' };
    if (actorType === 'native_agent') {
      return { actorType: 'native_agent', actorId: String(queueActorId || '').trim() };
    }
    const actorId = String(queueActorId || '').trim();
    if (!actorId) throw new Error('Select a specialist agent before running this action.');
    return { actorType: 'byo_agent', actorId };
  }, [queueActorId, queueActorType]);

  const handleApprovalRequiredResponse = useCallback(async (response, fallbackMessage) => {
    if (String(response?.status || '').trim().toLowerCase() !== 'approval_required') return false;
    setHandoffActionInfo(String(response?.reason || fallbackMessage || 'Action queued for approval.'));
    if (typeof onProtocolApprovalQueued === 'function') {
      await onProtocolApprovalQueued();
    }
    return true;
  }, [onProtocolApprovalQueued]);

  const applyHandoffWarnings = useCallback((response, fallbackMessage = '') => {
    const warnings = Array.isArray(response?.hookWarnings) ? response.hookWarnings.filter(Boolean) : [];
    if (warnings.length > 0) {
      setHandoffActionInfo(warnings.join(' '));
      return true;
    }
    if (fallbackMessage) setHandoffActionInfo(fallbackMessage);
    return false;
  }, []);

  const handleCreateHandoff = useCallback(async () => {
    const title = String(newHandoffTitle || '').trim();
    if (!title || handoffCreating) return;
    if (!newHandoffAutoRoute && newHandoffRequestedActorType === 'byo_agent' && !String(newHandoffRequestedActorId || '').trim()) {
      setHandoffCreateError('Select a specialist agent before creating this handoff.');
      return;
    }
    setHandoffCreating(true);
    setHandoffCreateError('');
    setHandoffCreateInfo('');
    try {
      const payload = {
        title,
        objective: String(newHandoffObjective || '').trim(),
        taskType: newHandoffTaskType,
        priority: newHandoffPriority,
        dueAt: String(newHandoffDueAt || '').trim() || undefined,
        context: {},
        input: {}
      };
      let response;
      if (newHandoffAutoRoute) {
        response = await createAutoAgentHandoff(payload);
        const routeSource = String(response?.planner?.routeSource || '').trim();
        if (routeSource) setHandoffCreateInfo(`Auto-routed via ${routeSource}.`);
      } else {
        response = await createAgentHandoff({
          ...payload,
          requestedActor: {
            actorType: newHandoffRequestedActorType,
            actorId: newHandoffRequestedActorType === 'byo_agent'
              ? String(newHandoffRequestedActorId || '').trim()
              : ''
          }
        });
      }
      if (String(response?.status || '').trim().toLowerCase() === 'approval_required') {
        setHandoffCreateInfo(String(response?.reason || 'Handoff creation queued for approval.'));
        if (typeof onProtocolApprovalQueued === 'function') await onProtocolApprovalQueued();
        return;
      }
      setNewHandoffTitle('');
      setNewHandoffObjective('');
      setNewHandoffDueAt('');
      if (Array.isArray(response?.hookWarnings) && response.hookWarnings.length > 0) {
        setHandoffCreateInfo(response.hookWarnings.join(' '));
      }
      await loadHandoffs();
      const createdId = String(response?.handoff?.handoffId || '').trim();
      if (createdId && typeof onOpenHandoff === 'function') onOpenHandoff(createdId);
      else setHandoffCreateInfo((previous) => previous || 'Handoff created.');
    } catch (error) {
      setHandoffCreateError(error.response?.data?.error || error.message || 'Failed to create handoff.');
    } finally {
      setHandoffCreating(false);
    }
  }, [
    handoffCreating,
    loadHandoffs,
    newHandoffAutoRoute,
    newHandoffDueAt,
    newHandoffObjective,
    newHandoffPriority,
    newHandoffRequestedActorId,
    newHandoffRequestedActorType,
    newHandoffTaskType,
    newHandoffTitle,
    onOpenHandoff,
    onProtocolApprovalQueued
  ]);

  const handleCreateScopedHandoff = useCallback(async (payload = {}) => {
    const title = String(payload?.title || '').trim();
    if (!title || handoffCreating) return null;
    const requestedActorType = String(payload?.requestedActor?.actorType || '').trim().toLowerCase();
    const requestedActorId = String(payload?.requestedActor?.actorId || '').trim();
    if (requestedActorType === 'byo_agent' && !requestedActorId) {
      setHandoffCreateError('Select a specialist agent before creating this handoff.');
      return null;
    }
    setHandoffCreating(true);
    setHandoffCreateError('');
    setHandoffCreateInfo('');
    try {
      const response = await createAgentHandoff({
        title,
        objective: String(payload?.objective || '').trim(),
        taskType: String(payload?.taskType || 'custom').trim() || 'custom',
        priority: String(payload?.priority || 'normal').trim() || 'normal',
        dueAt: String(payload?.dueAt || '').trim() || undefined,
        requestedActor: payload?.requestedActor || {},
        context: payload?.context && typeof payload.context === 'object' ? payload.context : {},
        input: payload?.input && typeof payload.input === 'object' ? payload.input : {}
      });
      if (String(response?.status || '').trim().toLowerCase() === 'approval_required') {
        setHandoffCreateInfo(String(response?.reason || 'Handoff creation queued for approval.'));
        if (typeof onProtocolApprovalQueued === 'function') await onProtocolApprovalQueued();
        return response;
      }
      if (Array.isArray(response?.hookWarnings) && response.hookWarnings.length > 0) {
        setHandoffCreateInfo(response.hookWarnings.join(' '));
      }
      await loadHandoffs();
      const createdId = String(response?.handoff?.handoffId || '').trim();
      if (createdId && typeof onOpenHandoff === 'function') onOpenHandoff(createdId);
      else setHandoffCreateInfo((previous) => previous || 'Handoff created.');
      return response;
    } catch (error) {
      setHandoffCreateError(error.response?.data?.error || error.message || 'Failed to create handoff.');
      return null;
    } finally {
      setHandoffCreating(false);
    }
  }, [handoffCreating, loadHandoffs, onOpenHandoff, onProtocolApprovalQueued]);

  const handleClaimHandoff = useCallback(async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    setHandoffActionInfo('');
    try {
      const actor = resolveQueueActorPayload();
      const response = await claimAgentHandoff(safeId, actor);
      if (await handleApprovalRequiredResponse(response, 'Claim queued for approval.')) return;
      applyHandoffWarnings(response);
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to claim handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  }, [applyHandoffWarnings, handoffActionBusyId, handleApprovalRequiredResponse, loadHandoffs, resolveQueueActorPayload]);

  const handleCompleteHandoff = useCallback(async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    setHandoffActionInfo('');
    try {
      const actor = resolveQueueActorPayload();
      const note = window.prompt('Completion note (optional):', '') || '';
      const response = await completeAgentHandoff(safeId, {
        ...actor,
        note: String(note || '').trim(),
        output: note ? { summary: String(note).trim() } : {}
      });
      if (await handleApprovalRequiredResponse(response, 'Completion queued for approval.')) return;
      applyHandoffWarnings(response);
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to complete handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  }, [applyHandoffWarnings, handoffActionBusyId, handleApprovalRequiredResponse, loadHandoffs, resolveQueueActorPayload]);

  const handleRejectHandoff = useCallback(async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    setHandoffActionInfo('');
    try {
      const actor = resolveQueueActorPayload();
      const note = window.prompt('Reject reason (optional):', '') || '';
      const response = await rejectAgentHandoff(safeId, {
        ...actor,
        note: String(note || '').trim()
      });
      if (await handleApprovalRequiredResponse(response, 'Rejection queued for approval.')) return;
      applyHandoffWarnings(response);
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to reject handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  }, [applyHandoffWarnings, handoffActionBusyId, handleApprovalRequiredResponse, loadHandoffs, resolveQueueActorPayload]);

  const handleCancelHandoff = useCallback(async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    setHandoffActionInfo('');
    try {
      await cancelAgentHandoff(safeId, {});
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to cancel handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  }, [handoffActionBusyId, loadHandoffs]);

  const handleContinueInThread = useCallback(async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return null;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    try {
      const response = await ensureAgentHandoffThread(safeId);
      if (response?.handoff) {
        setHandoffs((previous) => previous.map((row) => (
          String(row?.handoffId || '') === safeId ? response.handoff : row
        )));
      }
      const nextThreadId = String(response?.thread?.threadId || '').trim();
      if (nextThreadId && typeof onOpenThread === 'function') onOpenThread(nextThreadId);
      return response || null;
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to continue in thread.');
      return null;
    } finally {
      setHandoffActionBusyId('');
    }
  }, [handoffActionBusyId, onOpenThread]);

  return {
    personalAgents,
    sortedPersonalAgents,
    handoffs,
    activeHandoffData,
    handoffsLoading,
    handoffsError,
    handoffStatusFilter,
    setHandoffStatusFilter,
    queueActorType,
    setQueueActorType,
    queueActorId,
    setQueueActorId,
    handoffActionBusyId,
    handoffActionError,
    handoffActionInfo,
    newHandoffTitle,
    setNewHandoffTitle,
    newHandoffObjective,
    setNewHandoffObjective,
    newHandoffTaskType,
    setNewHandoffTaskType,
    newHandoffPriority,
    setNewHandoffPriority,
    newHandoffDueAt,
    setNewHandoffDueAt,
    newHandoffAutoRoute,
    setNewHandoffAutoRoute,
    newHandoffRequestedActorType,
    setNewHandoffRequestedActorType,
    newHandoffRequestedActorId,
    setNewHandoffRequestedActorId,
    handoffCreating,
    handoffCreateError,
    handoffCreateInfo,
    formatActor,
    formatDateTime,
    loadHandoffs,
    handleCreateHandoff,
    handleCreateScopedHandoff,
    handleClaimHandoff,
    handleCompleteHandoff,
    handleRejectHandoff,
    handleCancelHandoff,
    handleContinueInThread
  };
};

export default useHandoffs;
