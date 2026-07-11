import { useCallback, useMemo, useState } from 'react';
import { EMPTY_SYSTEM_STATUS, prependRecentReceipt } from './systemStatusModel';

/**
 * App-level system status state for the topbar affordance.
 * Codex can wire receipt producers to these setters later.
 */
export const useSystemStatus = (initialState = EMPTY_SYSTEM_STATUS) => {
  const [state, setState] = useState(() => ({
    ...EMPTY_SYSTEM_STATUS,
    ...initialState
  }));

  const setBackgroundWork = useCallback((backgroundWork) => {
    setState((prev) => {
      const next = backgroundWork || null;
      if (
        prev.backgroundWork === next
        || (
          prev.backgroundWork
          && next
          && prev.backgroundWork.label === next.label
          && prev.backgroundWork.stage === next.stage
        )
        || (!prev.backgroundWork && !next)
      ) return prev;
      return { ...prev, backgroundWork: next };
    });
  }, []);

  const setLatestReceipt = useCallback((latestReceipt) => {
    setState((prev) => {
      const next = latestReceipt || null;
      return {
        ...prev,
        latestReceipt: next,
        recentReceipts: next ? prependRecentReceipt(prev.recentReceipts, next) : prev.recentReceipts
      };
    });
  }, []);

  const clearRecentReceipts = useCallback(() => {
    setState((prev) => ({ ...prev, recentReceipts: [] }));
  }, []);

  const setRecoverableFailure = useCallback((recoverableFailure) => {
    setState((prev) => ({ ...prev, recoverableFailure: recoverableFailure || null }));
  }, []);

  const clearRecoverableFailure = useCallback(() => {
    setState((prev) => (prev.recoverableFailure ? { ...prev, recoverableFailure: null } : prev));
  }, []);

  const resetSystemStatus = useCallback(() => {
    setState(EMPTY_SYSTEM_STATUS);
  }, []);

  const api = useMemo(() => ({
    setBackgroundWork,
    setLatestReceipt,
    clearRecentReceipts,
    setRecoverableFailure,
    clearRecoverableFailure,
    resetSystemStatus
  }), [
    setBackgroundWork,
    setLatestReceipt,
    clearRecentReceipts,
    setRecoverableFailure,
    clearRecoverableFailure,
    resetSystemStatus
  ]);

  return { ...state, ...api };
};
