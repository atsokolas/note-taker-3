import { createContext, useContext } from 'react';
import {
  createConnectorCommands,
  createConnectorRuntimeSnapshot,
  resolveCapabilityAvailability
} from './noeisCapabilityModel';

const INITIAL_SNAPSHOT = createConnectorRuntimeSnapshot({ loading: true });

export const DEFAULT_NOEIS_CAPABILITY_VALUE = Object.freeze({
  provided: false,
  loading: true,
  error: '',
  connections: [],
  connectors: INITIAL_SNAPSHOT,
  commands: createConnectorCommands(INITIAL_SNAPSHOT),
  refresh: async () => {},
  resolveCapability: capabilityId => resolveCapabilityAvailability(capabilityId, INITIAL_SNAPSHOT)
});

export const NoeisCapabilityContext = createContext(DEFAULT_NOEIS_CAPABILITY_VALUE);

export const useNoeisCapabilities = () => useContext(NoeisCapabilityContext);

export default NoeisCapabilityContext;
