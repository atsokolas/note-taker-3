import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listImportConnections } from '../api/imports';
import {
  createConnectorCommands,
  createConnectorRuntimeSnapshot,
  resolveCapabilityAvailability
} from './noeisCapabilityModel';
import { NoeisCapabilityContext } from './noeisCapabilityContext';
import { createAuthScopedSnapshotCache } from './authScopedSnapshotCache';

const connectionSnapshotCache = createAuthScopedSnapshotCache({
  ttlMs: 30_000,
  load: () => listImportConnections(),
  normalize: connections => Array.isArray(connections) ? connections : []
});

export const resetNoeisCapabilitySnapshotForTests = () => {
  connectionSnapshotCache.reset();
};

export const NoeisCapabilityProvider = ({ children }) => {
  const [state, setState] = useState({ loading: true, error: '', connections: [] });
  const mountedRef = useRef(true);

  const refresh = useCallback(async ({ force = true } = {}) => {
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const connections = await connectionSnapshotCache.read({ force });
      if (!mountedRef.current) return;
      setState({ loading: false, error: '', connections: Array.isArray(connections) ? connections : [] });
    } catch (error) {
      if (!mountedRef.current) return;
      setState({
        loading: false,
        error: error?.response?.data?.error || error?.message || 'Connection readiness could not be checked.',
        connections: []
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh({ force: false });
    return () => { mountedRef.current = false; };
  }, [refresh]);

  const connectors = useMemo(() => createConnectorRuntimeSnapshot(state), [state]);
  const value = useMemo(() => ({
    provided: true,
    loading: state.loading,
    error: state.error,
    connections: state.connections,
    connectors,
    commands: createConnectorCommands(connectors),
    refresh,
    resolveCapability: capabilityId => resolveCapabilityAvailability(capabilityId, connectors)
  }), [connectors, refresh, state.connections, state.error, state.loading]);

  return <NoeisCapabilityContext.Provider value={value}>{children}</NoeisCapabilityContext.Provider>;
};

export default NoeisCapabilityProvider;
