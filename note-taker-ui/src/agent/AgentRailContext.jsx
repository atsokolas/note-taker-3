import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildContextualAgentSurface,
  filterContextualAgentHandlers
} from './contextualAgentContracts';
import { useNoeisCapabilities } from '../system/noeisCapabilityContext';
import { getAgentThread, streamChatWithAgent } from '../api/agent';
import {
  buildAgentContext,
  buildAgentMessage,
  mapAgentThreadMessages
} from './agentConversationModel';

// The agent rail's state lives above the router, because the rail does not
// leave when the column changes. A page tells the rail what it is looking at;
// the rail owns the durable conversation, proposals, and Accept/Dismiss. A
// room supplies only its narrow accepted-write adapter. Nothing the agent
// retrieves reaches the room until the human accepts it.

const AgentRailContext = createContext(null);
const ACTIVE_THREAD_STORAGE_KEY = 'noeis.agent.active_thread';

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
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState('');
  const [activity, setActivity] = useState('');
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
  const conversationStarted = useRef(false);

  const registerSurface = useCallback((next, owner) => {
    const normalized = { ...EMPTY_SURFACE, ...(next || {}) };
    const key = JSON.stringify(normalized);
    if (surfaceOwner.current === owner && surfaceKey.current === key) return;
    surfaceOwner.current = owner;
    surfaceKey.current = key;
    surfaceRevision.current += 1;
    pendingRevision.current = null;
    setSurface(normalized);
    // A different subject changes the agent's exact working context, not the
    // conversation. Only pending, page-bound writes are discarded.
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
    setError('');
  }, []);

  const setHandlers = useCallback((next, owner) => {
    if (owner && surfaceOwner.current !== owner) return;
    handlers.current = next || {};
  }, []);

  useEffect(() => {
    let cancelled = false;
    const savedThreadId = window.localStorage?.getItem(ACTIVE_THREAD_STORAGE_KEY) || '';
    if (!savedThreadId) return () => { cancelled = true; };
    getAgentThread(savedThreadId)
      .then((result) => {
        if (cancelled || conversationStarted.current || !result?.thread?.threadId) return;
        setThreadId(String(result.thread.threadId));
        setMessages(mapAgentThreadMessages(result.thread));
      })
      .catch(() => {
        if (!cancelled) window.localStorage?.removeItem(ACTIVE_THREAD_STORAGE_KEY);
      });
    return () => { cancelled = true; };
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

  const adoptThread = useCallback((thread) => {
    const nextThreadId = String(thread?.threadId || '').trim();
    if (!nextThreadId) return;
    conversationStarted.current = true;
    setThreadId(nextThreadId);
    setMessages(mapAgentThreadMessages(thread));
    window.localStorage?.setItem(ACTIVE_THREAD_STORAGE_KEY, nextThreadId);
  }, []);

  const resetConversation = useCallback(() => {
    conversationStarted.current = false;
    setThreadId('');
    setMessages([]);
    setProposals([]);
    window.localStorage?.removeItem(ACTIVE_THREAD_STORAGE_KEY);
  }, []);

  const dismissProposal = useCallback((proposalId, revision = surfaceRevision.current) => {
    setProposals((current) => current.filter(item => (
      item.id !== proposalId || item._surfaceRevision !== revision
    )));
  }, []);

  const ask = useCallback(async (question, options = {}) => {
    const revision = surfaceRevision.current;
    if (pendingRevision.current === revision) return;
    if (!agentAvailable) {
      setError(availabilityReason);
      return;
    }
    if (!surface.contractId) {
      setError('Open a knowledge room before asking against it.');
      return;
    }
    pendingRevision.current = revision;
    conversationStarted.current = true;
    setBusy(true);
    setError('');
    setActivity('Reading the current context…');
    const userMessage = buildAgentMessage({ role: 'user', text: question });
    const pendingAssistant = buildAgentMessage({ role: 'assistant', text: '' });
    setMessages(current => [...current, userMessage, pendingAssistant]);
    try {
      const result = await streamChatWithAgent({
        message: question,
        threadId: threadId || undefined,
        threadTitle: surface.subject || surface.roleLabel || 'Noeis conversation',
        persistThread: true,
        context: buildAgentContext(surface),
        history: messages.map(({ role, text }) => ({ role, text })),
        limit: 6
      }, {
        onActivity: (receipt) => setActivity(String(receipt?.summary || 'Working…')),
        onDelta: (delta) => setMessages(current => current.map(message => (
          message.id === pendingAssistant.id
            ? { ...message, text: `${message.text || ''}${delta}` }
            : message
        )))
      });
      const hydrated = result?.thread?.threadId ? mapAgentThreadMessages(result.thread) : [];
      if (hydrated.length) setMessages(hydrated);
      else {
        const assistant = buildAgentMessage({ role: 'assistant', text: result?.reply || 'No reply generated.', result });
        setMessages(current => current.map(message => (
          message.id === pendingAssistant.id ? assistant : message
        )));
      }
      if (result?.thread?.threadId) {
        adoptThread(result.thread);
      }
      if (!result?.structureProposal && surfaceRevision.current === revision && typeof handlers.current.onAccept === 'function') {
        const sentence = String(result?.reply || '').trim();
        const allowedFields = (surface.supportedActions || [])
          .filter(action => action.startsWith('accept.'))
          .map(action => action.slice('accept.'.length));
        if (sentence && allowedFields.length) {
          addProposal({
            id: `agent-reply:${Date.now()}`,
            sentence,
            body: sentence,
            source: (result?.relatedItems || []).map(item => item?.title).filter(Boolean).slice(0, 2).join(' and '),
            origin: options.origin || '',
            fields: Array.isArray(options.fields) && options.fields.length ? options.fields : allowedFields
          }, revision);
        }
      }
    } catch (askError) {
      setMessages(current => current.filter(message => message.id !== pendingAssistant.id));
      setError(askError?.response?.data?.error || askError?.message || 'That conversation could not continue.');
    } finally {
      if (pendingRevision.current === revision) {
        pendingRevision.current = null;
        setBusy(false);
        setActivity('');
      }
    }
  }, [addProposal, adoptThread, agentAvailable, availabilityReason, messages, surface, threadId]);

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
    messages,
    threadId,
    activity,
    busy,
    canAsk: Boolean(surface.contractId) && agentAvailable,
    availabilityReason,
    error,
    draft,
    setDraft,
    adoptThread,
    resetConversation,
    registerSurface,
    unregisterSurface,
    setHandlers,
    addProposal,
    dismissProposal,
    ask,
    accept
  }), [accept, activity, addProposal, adoptThread, agentAvailable, ask, availabilityReason, busy, dismissProposal, draft, error, messages, proposals, registerSurface, resetConversation, setHandlers, surface, threadId, unregisterSurface]);

  return <AgentRailContext.Provider value={value}>{children}</AgentRailContext.Provider>;
};

const EMPTY_AGENT_RAIL = Object.freeze({
  surface: EMPTY_SURFACE,
  proposals: [],
  messages: [],
  threadId: '',
  activity: '',
  busy: false,
  canAsk: false,
  availabilityReason: 'No contextual capability is active.',
  error: '',
  draft: '',
  setDraft: () => {},
  adoptThread: () => {},
  resetConversation: () => {},
  registerSurface: () => {},
  unregisterSurface: () => {},
  setHandlers: () => {},
  addProposal: () => {},
  dismissProposal: () => {},
  ask: async () => {},
  accept: async () => {}
});

export const useAgentRail = () => useContext(AgentRailContext) || EMPTY_AGENT_RAIL;

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
