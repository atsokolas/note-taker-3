import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildContextualAgentSurface,
  filterContextualAgentHandlers
} from './contextualAgentContracts';
import { useNoeisCapabilities } from '../system/noeisCapabilityContext';

// The agent rail's state lives above the router, because the rail does not
// leave when the column changes. A page tells the rail what it is looking at
// and how to ask on its behalf; the rail owns the asking, the proposals, and
// the Accept/Dismiss. Nothing the agent retrieves reaches the column until the
// human accepts it — that is the whole contract, so it lives in one place.

const AgentRailContext = createContext(null);

const EMPTY_SURFACE = Object.freeze({
  id: '',
  roleLabel: 'Agent',
  roleDescription: '',
  subject: '',
  lines: [],
  empty: ''
});

export const AgentRailProvider = ({ children }) => {
  const capabilityModel = useNoeisCapabilities();
  const [surface, setSurface] = useState(EMPTY_SURFACE);
  const [proposals, setProposals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  // Handlers change identity every render of the page that supplies them.
  // Holding them in a ref keeps that churn out of the render path.
  const handlers = useRef({});
  const surfaceKey = useRef('');
  const surfaceOwner = useRef(null);
  const surfaceRevision = useRef(0);
  const pendingRevision = useRef(null);

  const registerSurface = useCallback((next, owner) => {
    const normalized = { ...EMPTY_SURFACE, ...(next || {}) };
    const key = JSON.stringify(normalized);
    if (surfaceOwner.current === owner && surfaceKey.current === key) return;
    surfaceOwner.current = owner;
    surfaceKey.current = key;
    surfaceRevision.current += 1;
    pendingRevision.current = null;
    setSurface(normalized);
    // A different subject is a different conversation. Proposals about the
    // last thing must not follow the human to the next one.
    setProposals([]);
    setBusy(false);
    setError('');
  }, []);

  const unregisterSurface = useCallback((owner) => {
    if (surfaceOwner.current !== owner) return;
    surfaceOwner.current = null;
    surfaceKey.current = '';
    surfaceRevision.current += 1;
    pendingRevision.current = null;
    handlers.current = {};
    setSurface(EMPTY_SURFACE);
    setProposals([]);
    setBusy(false);
    setCanAsk(false);
    setError('');
  }, []);

  // Whether this surface can be asked at all. A surface that has not taught the
  // rail how to retrieve for it gets a quiet, disabled input rather than a
  // control that silently does nothing.
  const [canAsk, setCanAsk] = useState(false);

  const setHandlers = useCallback((next, owner) => {
    if (owner && surfaceOwner.current !== owner) return;
    handlers.current = next || {};
    setCanAsk(typeof handlers.current.onAsk === 'function');
  }, []);

  const capabilityChecks = (surface.capabilities || []).map(capabilityModel.resolveCapability);
  const blockedCapability = capabilityChecks.find(item => !['available', 'active'].includes(item.status));
  const agentAvailable = !blockedCapability;
  const availabilityReason = blockedCapability?.reason || 'Available for the current knowledge surface.';

  const addProposal = useCallback((proposal, revision = surfaceRevision.current) => {
    if (!proposal?.sentence) return;
    setProposals((current) => [
      ...current.filter(item => item.id !== proposal.id),
      { fields: ['why', 'against'], ...proposal, _surfaceRevision: revision }
    ]);
  }, []);

  const dismissProposal = useCallback((proposalId, revision = surfaceRevision.current) => {
    setProposals((current) => current.filter(item => (
      item.id !== proposalId || item._surfaceRevision !== revision
    )));
  }, []);

  const ask = useCallback(async (question, options = {}) => {
    const revision = surfaceRevision.current;
    if (pendingRevision.current === revision) return;
    const run = handlers.current.onAsk;
    if (!agentAvailable) {
      setError(availabilityReason);
      return;
    }
    /* A surface with nothing registered used to swallow the click: no request,
       no error, no sign anything had happened. Silence is the one answer an
       agent door must never give. */
    if (!run) {
      setError('This page has nothing to ask against yet.');
      return;
    }
    pendingRevision.current = revision;
    setBusy(true);
    setError('');
    try {
      const proposal = await run(question, options);
      if (surfaceRevision.current !== revision) return;
      if (proposal?.sentence) addProposal(proposal, revision);
      else setError('Nothing came back for that.');
    } catch (askError) {
      if (surfaceRevision.current !== revision) return;
      setError(askError?.response?.data?.error || askError?.message || 'That search could not run.');
    } finally {
      if (pendingRevision.current === revision) {
        pendingRevision.current = null;
        setBusy(false);
      }
    }
  }, [addProposal, agentAvailable, availabilityReason]);

  const accept = useCallback(async (proposal, field) => {
    const revision = surfaceRevision.current;
    if (proposal?._surfaceRevision !== revision) return;
    const write = handlers.current.onAccept;
    if (!write) return;
    const allowed = Array.isArray(surface.supportedActions) ? surface.supportedActions : [];
    if (!allowed.includes(`accept.${field}`)) {
      setError('This page does not permit that agent action. Nothing was written down.');
      return;
    }
    dismissProposal(proposal.id, revision);
    setError('');
    try {
      await write(proposal, field);
    } catch (writeError) {
      setError(writeError?.response?.data?.error || 'That line could not be saved. It has not been written down.');
      if (surfaceRevision.current === revision) addProposal(proposal, revision);
    }
  }, [addProposal, dismissProposal, surface.supportedActions]);

  const value = useMemo(() => ({
    surface,
    proposals,
    busy,
    canAsk: canAsk && agentAvailable,
    availabilityReason,
    error,
    draft,
    setDraft,
    registerSurface,
    unregisterSurface,
    setHandlers,
    addProposal,
    dismissProposal,
    ask,
    accept
  }), [accept, addProposal, agentAvailable, ask, availabilityReason, busy, canAsk, dismissProposal, draft, error, proposals, registerSurface, setHandlers, surface, unregisterSurface]);

  return <AgentRailContext.Provider value={value}>{children}</AgentRailContext.Provider>;
};

export const useAgentRail = () => useContext(AgentRailContext) || {
  surface: EMPTY_SURFACE,
  proposals: [],
  busy: false,
  canAsk: false,
  availabilityReason: 'No contextual capability is active.',
  error: '',
  draft: '',
  setDraft: () => {},
  registerSurface: () => {},
  unregisterSurface: () => {},
  setHandlers: () => {},
  addProposal: () => {},
  dismissProposal: () => {},
  ask: async () => {},
  accept: async () => {}
};

/**
 * Called by a page to say what the rail is looking at and how to act for it.
 *
 * `descriptor` is plain data and is compared by value, so a page can rebuild it
 * every render. `handlers` is stored in a ref and may change freely.
 */
const useResolvedAgentSurface = (descriptor, handlers) => {
  const { registerSurface, unregisterSurface, setHandlers } = useAgentRail();
  const owner = useRef(Symbol('agent-surface-owner'));
  const descriptorKey = JSON.stringify(descriptor || null);

  useEffect(() => {
    const currentOwner = owner.current;
    registerSurface(descriptor ? JSON.parse(descriptorKey) : null, currentOwner);
    return () => unregisterSurface(currentOwner);
  }, [descriptorKey, registerSurface, unregisterSurface]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHandlers(handlers, owner.current);
  });
};

/* The room names a contract and supplies exact runtime data. Capability and
   approval policy stay in the registry instead of being re-inferred inside
   the rail or copied into each page. */
export const useContextualAgentSurface = (contractId, context, handlers) => {
  const descriptor = buildContextualAgentSurface(contractId, context);
  const filteredHandlers = filterContextualAgentHandlers(contractId, handlers);
  useResolvedAgentSurface(descriptor, filteredHandlers);
};

export default AgentRailContext;
