import { useCallback, useEffect, useState } from 'react';
import { listAgentProtocolHookRuns } from '../api/agent';

const useProtocolHookRuns = ({
  phase = '',
  op = '',
  threadId = '',
  handoffId = '',
  limit = 12,
  autoLoad = true
} = {}) => {
  const [hookRuns, setHookRuns] = useState([]);
  const [hookRunsLoading, setHookRunsLoading] = useState(false);
  const [hookRunsError, setHookRunsError] = useState('');

  const loadHookRuns = useCallback(async () => {
    setHookRunsLoading(true);
    setHookRunsError('');
    try {
      const response = await listAgentProtocolHookRuns({
        phase,
        op,
        threadId,
        handoffId,
        limit
      });
      setHookRuns(Array.isArray(response?.hookRuns) ? response.hookRuns : []);
    } catch (error) {
      setHookRuns([]);
      setHookRunsError(error.response?.data?.error || 'Failed to load protocol hook activity.');
    } finally {
      setHookRunsLoading(false);
    }
  }, [handoffId, limit, op, phase, threadId]);

  useEffect(() => {
    if (!autoLoad) return undefined;
    loadHookRuns();
    return undefined;
  }, [autoLoad, loadHookRuns]);

  return {
    hookRuns,
    hookRunsLoading,
    hookRunsError,
    loadHookRuns
  };
};

export default useProtocolHookRuns;
