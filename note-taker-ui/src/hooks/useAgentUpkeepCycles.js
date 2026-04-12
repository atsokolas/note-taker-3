import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAgentUpkeepCycle,
  listAgentUpkeepCycles,
  resumeAgentUpkeepCycle,
  updateAgentUpkeepCycle
} from '../api/agent';

const clean = (value) => String(value || '').trim();

const useAgentUpkeepCycles = ({
  status = 'active',
  limit = 12,
  autoLoad = true,
  onChanged = null
} = {}) => {
  const [upkeepCycles, setUpkeepCycles] = useState([]);
  const [upkeepCyclesLoading, setUpkeepCyclesLoading] = useState(false);
  const [upkeepCyclesError, setUpkeepCyclesError] = useState('');
  const [upkeepCycleBusyId, setUpkeepCycleBusyId] = useState('');

  const loadUpkeepCycles = useCallback(async () => {
    setUpkeepCyclesLoading(true);
    setUpkeepCyclesError('');
    try {
      const response = await listAgentUpkeepCycles({ status, limit });
      setUpkeepCycles(Array.isArray(response?.cycles) ? response.cycles : []);
    } catch (error) {
      setUpkeepCycles([]);
      setUpkeepCyclesError(error.response?.data?.error || 'Failed to load upkeep cycles.');
    } finally {
      setUpkeepCyclesLoading(false);
    }
  }, [limit, status]);

  useEffect(() => {
    if (!autoLoad) return undefined;
    loadUpkeepCycles();
    return undefined;
  }, [autoLoad, loadUpkeepCycles]);

  const runCycleAction = useCallback(async (cycleId, action) => {
    const safeId = clean(cycleId);
    if (!safeId || upkeepCycleBusyId) return null;
    setUpkeepCycleBusyId(safeId);
    setUpkeepCyclesError('');
    try {
      const result = await action(safeId);
      if (result?.notDue) {
        setUpkeepCyclesError(clean(result?.message) || 'Upkeep cycle is not due yet.');
        await loadUpkeepCycles();
        return result || null;
      }
      await loadUpkeepCycles();
      if (typeof onChanged === 'function') await onChanged(result || null);
      return result || null;
    } catch (error) {
      setUpkeepCyclesError(error.response?.data?.error || 'Failed to update upkeep cycle.');
      return null;
    } finally {
      setUpkeepCycleBusyId('');
    }
  }, [loadUpkeepCycles, onChanged, upkeepCycleBusyId]);

  const handleCreateUpkeepCycle = useCallback(async (payload = {}) => {
    setUpkeepCyclesError('');
    try {
      const result = await createAgentUpkeepCycle(payload);
      await loadUpkeepCycles();
      if (typeof onChanged === 'function') await onChanged(result || null);
      return result || null;
    } catch (error) {
      setUpkeepCyclesError(error.response?.data?.error || 'Failed to create upkeep cycle.');
      return null;
    }
  }, [loadUpkeepCycles, onChanged]);

  const handleResumeUpkeepCycle = useCallback((cycleId, options = {}) => (
    runCycleAction(cycleId, (safeId) => resumeAgentUpkeepCycle(safeId, options))
  ), [runCycleAction]);

  const handlePauseUpkeepCycle = useCallback((cycleId) => (
    runCycleAction(cycleId, (safeId) => updateAgentUpkeepCycle(safeId, { status: 'paused' }))
  ), [runCycleAction]);

  const handleActivateUpkeepCycle = useCallback((cycleId) => (
    runCycleAction(cycleId, (safeId) => updateAgentUpkeepCycle(safeId, { status: 'active' }))
  ), [runCycleAction]);

  const handleCompleteUpkeepCycle = useCallback((cycleId) => (
    runCycleAction(cycleId, (safeId) => updateAgentUpkeepCycle(safeId, { status: 'completed' }))
  ), [runCycleAction]);

  const activeCount = useMemo(
    () => upkeepCycles.filter((cycle) => clean(cycle?.status).toLowerCase() === 'active').length,
    [upkeepCycles]
  );

  return {
    upkeepCycles,
    upkeepCyclesLoading,
    upkeepCyclesError,
    upkeepCycleBusyId,
    activeCount,
    loadUpkeepCycles,
    handleCreateUpkeepCycle,
    handleResumeUpkeepCycle,
    handlePauseUpkeepCycle,
    handleActivateUpkeepCycle,
    handleCompleteUpkeepCycle
  };
};

export default useAgentUpkeepCycles;
