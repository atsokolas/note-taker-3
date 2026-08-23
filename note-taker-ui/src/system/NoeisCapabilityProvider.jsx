import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listImportConnections } from '../api/imports';
import {
  createConnectorCommands,
  createConnectorRuntimeSnapshot,
  resolveCapabilityAvailability
} from './noeisCapabilityModel';
import { NoeisCapabilityContext } from './noeisCapabilityContext';

const SNAPSHOT_TTL_MS = 30_000;
let cachedConnections = null;
let cachedAt = 0;
let pendingConnections = null;

const loadConnectionSnapshot = async ({ force = false } = {}) => {
  const fresh = Array.isArray(cachedConnections) && (Date.now() - cachedAt) < SNAPSHOT_TTL_MS;
  if (!force && fresh) return cachedConnections;
  if (pendingConnections) return pendingConnections;
  pendingConnections = listImportConnections()
    .then((connections) => {
      cachedConnections = Array.isArray(connections) ? connections : [];
      cachedAt = Date.now();
      return cachedConnections;
    })
    .finally(() => {
      pendingConnections = null;
    });
  return pendingConnections;
};

export const resetNoeisCapabilitySnapshotForTests = () => {
  cachedConnections = null;
  cachedAt = 0;
  pendingConnections = null;
};

export const NoeisCapabilityProvider = ({ children }) => {
  const [state, setState] = useState({ loading: true, error: '', connections: [] });

  const refresh = useCallback(async ({ force = true } = {}) => {
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const connections = await loadConnectionSnapshot({ force });
      setState({ loading: false, error: '', connections: Array.isArray(connections) ? connections : [] });
    } catch (error) {
      setState({
        loading: false,
        error: error?.response?.data?.error || error?.message || 'Connection readiness could not be checked.',
        connections: []
      });
    }
  }, []);

  useEffect(() => {
    refresh({ force: false });
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
