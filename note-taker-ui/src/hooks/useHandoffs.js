import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelAgentHandoff,
  claimAgentHandoff,
  completeAgentHandoff,
  createAgentHandoff,
  createAutoAgentHandoff,
  listAgentHandoffs,
  listPersonalAgents,
  rejectAgentHandoff
} from '../api/agent';

const useHandoffs = ({
  enabled = false,
  selectedHandoffId = '',
  onOpenHandoff = null,
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
      map.set(String(agent?._id || ''), String(agent?.name || 'BYO agent'));
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
    if (actorType === 'user') return 'User';
    if (actorType === 'native_agent') return actorId ? `Native (${actorId})` : 'Native agent';
    if (actorType === 'byo_agent') return agentNameById.get(actorId) || `BYO (${actorId || 'unknown'})`;
    return 'Unknown actor';
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
    if (!actorId) throw new Error('Select a BYO agent before running this action.');
    return { actorType: 'byo_agent', actorId };
  }, [queueActorId, queueActorType]);

  const handleCreateHandoff = useCallback(async () => {
    const title = String(newHandoffTitle || '').trim();
    if (!title || handoffCreating) return;
    if (!newHandoffAutoRoute && newHandoffRequestedActorType === 'byo_agent' && !String(newHandoffRequestedActorId || '').trim()) {
      setHandoffCreateError('Select a BYO agent before creating this handoff.');
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
      setNewHandoffTitle('');
      setNewHandoffObjective('');
      setNewHandoffDueAt('');
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
    onOpenHandoff
  ]);

  const handleClaimHandoff = useCallback(async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    try {
      const actor = resolveQueueActorPayload();
      await claimAgentHandoff(safeId, actor);
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to claim handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  }, [handoffActionBusyId, loadHandoffs, resolveQueueActorPayload]);

  const handleCompleteHandoff = useCallback(async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    try {
      const actor = resolveQueueActorPayload();
      const note = window.prompt('Completion note (optional):', '') || '';
      await completeAgentHandoff(safeId, {
        ...actor,
        note: String(note || '').trim(),
        output: note ? { summary: String(note).trim() } : {}
      });
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to complete handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  }, [handoffActionBusyId, loadHandoffs, resolveQueueActorPayload]);

  const handleRejectHandoff = useCallback(async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    try {
      const actor = resolveQueueActorPayload();
      const note = window.prompt('Reject reason (optional):', '') || '';
      await rejectAgentHandoff(safeId, {
        ...actor,
        note: String(note || '').trim()
      });
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to reject handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  }, [handoffActionBusyId, loadHandoffs, resolveQueueActorPayload]);

  const handleCancelHandoff = useCallback(async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    try {
      await cancelAgentHandoff(safeId, {});
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to cancel handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  }, [handoffActionBusyId, loadHandoffs]);

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
    handleClaimHandoff,
    handleCompleteHandoff,
    handleRejectHandoff,
    handleCancelHandoff
  };
};

export default useHandoffs;
