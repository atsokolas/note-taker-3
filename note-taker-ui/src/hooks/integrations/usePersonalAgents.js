import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPersonalAgent,
  disablePersonalAgent,
  listPersonalAgents,
  updatePersonalAgent,
  rotatePersonalAgentKey
} from '../../api/agent';

const usePersonalAgents = () => {
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [agentWorkerRoles, setAgentWorkerRoles] = useState([]);
  const [agentBusyId, setAgentBusyId] = useState('');
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [newAgentKey, setNewAgentKey] = useState('');

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentsError('');
    try {
      const rows = await listPersonalAgents();
      setAgents(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to load personal agents.');
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

  const handleCreateAgent = useCallback(async () => {
    const name = String(agentName || '').trim();
    if (!name || creatingAgent) return;
    setCreatingAgent(true);
    setAgentsError('');
    setNewAgentKey('');
    try {
      const response = await createPersonalAgent({
        name,
        description: String(agentDescription || '').trim(),
        preferredWorkerRoles: Array.isArray(agentWorkerRoles) ? agentWorkerRoles : []
      });
      await loadAgents();
      setAgentName('');
      setAgentDescription('');
      setAgentWorkerRoles([]);
      setNewAgentKey(String(response?.apiKey || '').trim());
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to create personal agent.');
    } finally {
      setCreatingAgent(false);
    }
  }, [agentDescription, agentName, agentWorkerRoles, creatingAgent, loadAgents]);

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
      setAgentsError(error.response?.data?.error || 'Failed to update personal agent.');
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
      setAgentsError(error.response?.data?.error || 'Failed to rotate personal agent key.');
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
      setAgentsError(error.response?.data?.error || 'Failed to disable personal agent.');
    } finally {
      setAgentBusyId('');
    }
  }, [agentBusyId, loadAgents]);

  return {
    agents,
    sortedAgents,
    agentsLoading,
    agentsError,
    agentName,
    setAgentName,
    agentDescription,
    setAgentDescription,
    agentWorkerRoles,
    setAgentWorkerRoles,
    agentBusyId,
    creatingAgent,
    newAgentKey,
    handleCreateAgent,
    handleUpdateAgent,
    handleRotateKey,
    handleDisableAgent
  };
};

export default usePersonalAgents;
