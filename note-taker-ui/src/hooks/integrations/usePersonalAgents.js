import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPersonalAgent,
  disablePersonalAgent,
  listPersonalAgents,
  rotatePersonalAgentKey
} from '../../api/agent';

const usePersonalAgents = () => {
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
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
        description: String(agentDescription || '').trim()
      });
      await loadAgents();
      setAgentName('');
      setAgentDescription('');
      setNewAgentKey(String(response?.apiKey || '').trim());
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to create personal agent.');
    } finally {
      setCreatingAgent(false);
    }
  }, [agentDescription, agentName, creatingAgent, loadAgents]);

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
    agentBusyId,
    creatingAgent,
    newAgentKey,
    handleCreateAgent,
    handleRotateKey,
    handleDisableAgent
  };
};

export default usePersonalAgents;
