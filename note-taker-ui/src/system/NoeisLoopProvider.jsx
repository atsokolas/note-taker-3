import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSystemLoops } from '../api/systemLoops';
import { useSystemStatusControls, useSystemStatusSnapshot } from './SystemStatusContext';
import { normalizeSystemReceipt } from './systemStatusModel';
import { NoeisLoopContext } from './noeisLoopContext';
import { NOEIS_LOOP_STATUS_CHANGED_EVENT } from './noeisLoopEvents';
import { NOEIS_LOOP_DEFINITIONS, createCheckingLoopSnapshot, createErrorLoopSnapshot, latestLoopReceipt } from './noeisLoopModel';

const SNAPSHOT_TTL_MS = 60_000;
let cachedEnvelope = null;
let cachedAt = 0;
let pendingEnvelope = null;

const loadLoopSnapshot = async ({ force = false } = {}) => {
  const fresh = cachedEnvelope && (Date.now() - cachedAt) < SNAPSHOT_TTL_MS;
  if (!force && fresh) return cachedEnvelope;
  if (pendingEnvelope) return pendingEnvelope;
  pendingEnvelope = getSystemLoops()
    .then((envelope) => {
      cachedEnvelope = envelope;
      cachedAt = Date.now();
      return envelope;
    })
    .finally(() => { pendingEnvelope = null; });
  return pendingEnvelope;
};

export const resetNoeisLoopSnapshotForTests = () => {
  cachedEnvelope = null;
  cachedAt = 0;
  pendingEnvelope = null;
};

const labelForLoop = loopId => NOEIS_LOOP_DEFINITIONS.find(loop => loop.id === loopId)?.name || 'Background loop';

const isNewerReceipt = (candidate, current) => {
  const candidateAt = Date.parse(candidate?.completedAt || '');
  const currentAt = Date.parse(current?.completedAt || '');
  return Number.isFinite(candidateAt) && Number.isFinite(currentAt) && candidateAt > currentAt;
};

export const NoeisLoopProvider = ({ children }) => {
  const [state, setState] = useState({ loading: true, error: '', generatedAt: '', loops: createCheckingLoopSnapshot() });
  const controls = useSystemStatusControls();
  const {
    setBackgroundWork,
    setLatestReceipt,
    setRecoverableFailure,
    clearRecoverableFailure
  } = controls;
  const systemSnapshot = useSystemStatusSnapshot();
  const systemSnapshotRef = useRef(systemSnapshot);
  systemSnapshotRef.current = systemSnapshot;
  const mountedRef = useRef(true);
  const projectedRef = useRef({ backgroundLoopId: '', failureLoopId: '', statusFailure: false });

  const projectSystemStatus = useCallback((loops) => {
    const values = Object.values(loops || {});
    const running = values.find(loop => loop.status === 'running');
    if (running) {
      setBackgroundWork({ loopId: running.id, label: labelForLoop(running.id), stage: running.reason });
      projectedRef.current.backgroundLoopId = running.id;
    } else if (projectedRef.current.backgroundLoopId) {
      if (systemSnapshotRef.current.backgroundWork?.loopId === projectedRef.current.backgroundLoopId) {
        setBackgroundWork(null);
      }
      projectedRef.current.backgroundLoopId = '';
    }

    const failed = values.find(loop => loop.status === 'error');
    const currentFailure = systemSnapshotRef.current.recoverableFailure;
    if (failed && (!currentFailure || currentFailure.loopId || currentFailure.source === 'loop-registry')) {
      setRecoverableFailure({
        loopId: failed.id,
        stage: labelForLoop(failed.id),
        message: failed.reason,
        retryable: true
      });
      projectedRef.current.failureLoopId = failed.id;
    } else if (projectedRef.current.failureLoopId) {
      if (currentFailure?.loopId === projectedRef.current.failureLoopId) clearRecoverableFailure();
      projectedRef.current.failureLoopId = '';
    }

    const latest = latestLoopReceipt(loops);
    const receipt = latest ? normalizeSystemReceipt(latest.receipt, { href: loops[latest.loopId]?.href }) : null;
    const currentReceipt = systemSnapshotRef.current.latestReceipt;
    if (receipt && (!currentReceipt || currentReceipt.loopId || isNewerReceipt(receipt, currentReceipt))) {
      setLatestReceipt({ ...receipt, loopId: latest.loopId });
    }
  }, [clearRecoverableFailure, setBackgroundWork, setLatestReceipt, setRecoverableFailure]);

  const refresh = useCallback(async ({ force = true } = {}) => {
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const envelope = await loadLoopSnapshot({ force });
      if (!mountedRef.current) return;
      setState({ loading: false, error: '', generatedAt: envelope.generatedAt, loops: envelope.loops });
      if (projectedRef.current.statusFailure && systemSnapshotRef.current.recoverableFailure?.source === 'loop-registry') {
        clearRecoverableFailure();
      }
      projectedRef.current.statusFailure = false;
      projectSystemStatus(envelope.loops);
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error?.response?.data?.error || error?.message || 'Background-loop status could not be checked.';
      setState(current => ({
        ...current,
        loading: false,
        error: message,
        loops: createErrorLoopSnapshot(message)
      }));
      setRecoverableFailure({
        source: 'loop-registry',
        stage: 'Background loops',
        message,
        retryable: true,
        retry: () => refresh({ force: true })
      });
      projectedRef.current.statusFailure = true;
    }
  }, [clearRecoverableFailure, projectSystemStatus, setRecoverableFailure]);

  useEffect(() => {
    mountedRef.current = true;
    refresh({ force: false });
    return () => { mountedRef.current = false; };
  }, [refresh]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'hidden') return;
      refresh({ force: false });
    };
    const refreshAfterMutation = () => refresh({ force: true });
    window.addEventListener('focus', refreshIfVisible);
    window.addEventListener('online', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener(NOEIS_LOOP_STATUS_CHANGED_EVENT, refreshAfterMutation);
    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      window.removeEventListener('online', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener(NOEIS_LOOP_STATUS_CHANGED_EVENT, refreshAfterMutation);
    };
  }, [refresh]);

  const value = useMemo(() => ({ provided: true, ...state, refresh }), [refresh, state]);
  return <NoeisLoopContext.Provider value={value}>{children}</NoeisLoopContext.Provider>;
};

export default NoeisLoopProvider;
