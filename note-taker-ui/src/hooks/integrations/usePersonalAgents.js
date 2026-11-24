import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  disablePersonalAgent,
  listPersonalAgents,
  updatePersonalAgent,
  rotatePersonalAgentKey
} from '../../api/agent';

const usePersonalAgents = () => {
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState('');
  const [agentBusyId, setAgentBusyId] = useState('');
  const [newAgentKey, setNewAgentKey] = useState('');

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentsError('');
    try {
      const rows = await listPersonalAgents();
      setAgents(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to load specialist agents.');
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const sortedAgents = useMemo(() => (
    [...agents].sort((a, b) => {
      const aTime = new Date(a?.updatedAt || 0).getTime();
      const bTime = new Date(b?.updatedAt || 0).getTime();
      return bTime - aTime;
    })
  ), [agents]);

  const handleUpdateAgent = useCallback(async (agentId, payload = {}) => {
    const safeId = String(agentId || '').trim();
    if (!safeId || agentBusyId) return null;
    setAgentBusyId(safeId);
    setAgentsError('');
    try {
      const response = await updatePersonalAgent(safeId, payload);
      await loadAgents();
      return response?.agent || null;
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to update specialist agent.');
      return null;
    } finally {
      setAgentBusyId('');
    }
  }, [agentBusyId, loadAgents]);

  const handleRotateKey = useCallback(async (agentId) => {
    const safeId = String(agentId || '').trim();
    if (!safeId || agentBusyId) return;
    setAgentBusyId(safeId);
    setAgentsError('');
    setNewAgentKey('');
    try {
      const response = await rotatePersonalAgentKey(safeId);
      await loadAgents();
      setNewAgentKey(String(response?.apiKey || '').trim());
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to rotate specialist agent key.');
    } finally {
      setAgentBusyId('');
    }
  }, [agentBusyId, loadAgents]);

  const handleDisableAgent = useCallback(async (agentId) => {
    const safeId = String(agentId || '').trim();
    if (!safeId || agentBusyId) return;
    setAgentBusyId(safeId);
    setAgentsError('');
    try {
      await disablePersonalAgent(safeId);
      await loadAgents();
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to disable specialist agent.');
    } finally {
      setAgentBusyId('');
    }
  }, [agentBusyId, loadAgents]);

  return {
    agents,
    sortedAgents,
    agentsLoading,
    agentsError,
    agentBusyId,
    newAgentKey,
    handleUpdateAgent,
    handleRotateKey,
    handleDisableAgent
  };
};

export default usePersonalAgents;
