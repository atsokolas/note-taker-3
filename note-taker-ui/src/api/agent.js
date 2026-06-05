import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const executeAgentActions = async (payload = {}) => {
  const res = await api.post('/api/agent/actions/execute', payload, getAuthHeaders());
  return res.data || {};
};

export const chatWithAgent = async (payload = {}) => {
  const res = await api.post('/api/agent/chat', payload, getAuthHeaders());
  return res.data || {};
};

const apiUrl = (path = '') => {
  const base = String(api.defaults?.baseURL || '').trim();
  if (!base) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/+$/g, '')}/${String(path || '').replace(/^\/+/g, '')}`;
};

const parseSseBlock = (block = '') => {
  let event = 'message';
  const data = [];
  String(block || '').split(/\r?\n/).forEach((line) => {
    if (line.startsWith('event:')) event = line.slice(6).trim() || 'message';
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  });
  const raw = data.join('\n');
  if (!raw) return { event, payload: null };
  try {
    return { event, payload: JSON.parse(raw) };
  } catch (_error) {
    return { event, payload: { raw } };
  }
};

export const streamChatWithAgent = async (payload = {}, handlers = {}) => {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/agent/chat/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload || {}),
    signal: handlers.signal
  });

  if (!res.ok) {
    let message = 'Failed to generate agent reply.';
    try {
      const body = await res.json();
      message = body?.error || message;
    } catch (_error) {
      // Keep the generic error for non-JSON stream failures.
    }
    throw new Error(message);
  }

  if (!res.body?.getReader) {
    const body = await res.json();
    handlers.onFinal?.(body);
    return body || {};
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload = null;
  let streamError = null;

  const consumeBlock = (block) => {
    const { event, payload: blockPayload } = parseSseBlock(block);
    if (!blockPayload) return;
    handlers.onEvent?.(event, blockPayload);
    if (event === 'agent-activity') handlers.onActivity?.(blockPayload);
    if (event === 'agent-delta') handlers.onDelta?.(String(blockPayload.delta || ''), blockPayload);
    if (event === 'agent-final') {
      finalPayload = blockPayload;
      handlers.onFinal?.(blockPayload);
    }
    if (event === 'error') {
      streamError = new Error(blockPayload.error || blockPayload.message || 'Failed to generate agent reply.');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    blocks.forEach(consumeBlock);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeBlock(buffer);
  if (streamError) throw streamError;
  return finalPayload || {};
};

export const getAgentEntitlements = async () => {
  const res = await api.get('/api/agent/entitlements', getAuthHeaders());
  return res.data || { entitlements: {} };
};

export const updateAgentEntitlementsDev = async (payload = {}) => {
  const res = await api.patch('/api/agent/entitlements/dev', payload, getAuthHeaders());
  return res.data || { entitlements: {} };
};

export const listAgentApprovals = async ({
  conceptId = '',
  status = 'pending',
  limit = 30
} = {}) => {
  const params = new URLSearchParams();
  if (conceptId) params.set('conceptId', String(conceptId).trim());
  if (status) params.set('status', String(status).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/actions/approvals${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { approvals: [] };
};

export const approveAgentAction = async (approvalId, payload = {}) => {
  const safeApprovalId = encodeURIComponent(String(approvalId || '').trim());
  const res = await api.post(`/api/agent/actions/approvals/${safeApprovalId}/approve`, payload, getAuthHeaders());
  return res.data || {};
};

export const rejectAgentAction = async (approvalId, payload = {}) => {
  const safeApprovalId = encodeURIComponent(String(approvalId || '').trim());
  const res = await api.post(`/api/agent/actions/approvals/${safeApprovalId}/reject`, payload, getAuthHeaders());
  return res.data || {};
};

export const undoLastAgentAction = async (payload = {}) => {
  const res = await api.post('/api/agent/actions/undo', payload, getAuthHeaders());
  return res.data || {};
};

export const listAgentSoftDeletes = async ({
  conceptId = '',
  status = 'deleted',
  limit = 60
} = {}) => {
  const params = new URLSearchParams();
  if (conceptId) params.set('conceptId', String(conceptId).trim());
  if (status) params.set('status', String(status).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/actions/deletions${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { retentionDays: 30, records: [] };
};

export const restoreAgentSoftDelete = async (recordId, payload = {}) => {
  const safeRecordId = encodeURIComponent(String(recordId || '').trim());
  const res = await api.post(`/api/agent/actions/deletions/${safeRecordId}/restore`, payload, getAuthHeaders());
  return res.data || {};
};

export const listPersonalAgents = async () => {
  const res = await api.get('/api/agents/personal', getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const createPersonalAgent = async (payload = {}) => {
  const res = await api.post('/api/agents/personal', payload, getAuthHeaders());
  return res.data || {};
};

export const updatePersonalAgent = async (agentId, payload = {}) => {
  const safeId = encodeURIComponent(String(agentId || '').trim());
  const res = await api.patch(`/api/agents/personal/${safeId}`, payload, getAuthHeaders());
  return res.data || {};
};

export const rotatePersonalAgentKey = async (agentId) => {
  const safeId = encodeURIComponent(String(agentId || '').trim());
  const res = await api.post(`/api/agents/personal/${safeId}/rotate-key`, {}, getAuthHeaders());
  return res.data || {};
};

export const disablePersonalAgent = async (agentId) => {
  const safeId = encodeURIComponent(String(agentId || '').trim());
  const res = await api.delete(`/api/agents/personal/${safeId}`, getAuthHeaders());
  return res.data || {};
};

export const listAgentTokens = async () => {
  const res = await api.get('/api/agent-tokens', getAuthHeaders());
  return res.data || { tokens: [] };
};

export const listAgentTokenActions = async (tokenId, { limit = 50 } = {}) => {
  const safeId = encodeURIComponent(String(tokenId || '').trim());
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent-tokens/${safeId}/actions${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { actions: [], counts: { today: 0, week: 0 } };
};

export const undoAgentTokenAction = async (action = {}) => {
  const undoPath = String(action?.undoPath || action?.metadata?.undoPath || '').trim();
  if (!undoPath || !undoPath.startsWith('/api/wiki/')) {
    throw new Error('This action cannot be undone from Settings.');
  }
  const res = await api.post(undoPath, {}, getAuthHeaders());
  return res.data || {};
};

export const createAgentToken = async (payload = {}) => {
  const res = await api.post('/api/agent-tokens', payload, getAuthHeaders());
  return res.data || {};
};

export const revokeAgentToken = async (tokenId) => {
  const safeId = encodeURIComponent(String(tokenId || '').trim());
  const res = await api.post(`/api/agent-tokens/${safeId}/revoke`, {}, getAuthHeaders());
  return res.data || {};
};

export const deleteAgentToken = async (tokenId) => {
  const safeId = encodeURIComponent(String(tokenId || '').trim());
  const res = await api.delete(`/api/agent-tokens/${safeId}`, getAuthHeaders());
  return res.data || {};
};

export const createAgentHandoff = async (payload = {}) => {
  const res = await api.post('/api/agent/protocol/handoffs', payload, getAuthHeaders());
  return res.data || {};
};

export const listAgentRuns = async ({
  threadId = '',
  status = 'all',
  limit = 30
} = {}) => {
  const params = new URLSearchParams();
  if (threadId) params.set('threadId', String(threadId).trim());
  if (status) params.set('status', String(status).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/runs${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { runs: [] };
};

export const createAgentRun = async (payload = {}) => {
  const res = await api.post('/api/agent/runs', payload, getAuthHeaders());
  return res.data || {};
};

export const resumeAgentRun = async (runId, payload = {}) => {
  const safeId = encodeURIComponent(String(runId || '').trim());
  const res = await api.post(`/api/agent/runs/${safeId}/resume`, payload, getAuthHeaders());
  return res.data || {};
};

export const listAgentProposedChanges = async ({
  threadId = '',
  runId = '',
  status = 'all',
  targetType = '',
  targetId = '',
  limit = 40
} = {}) => {
  const params = new URLSearchParams();
  if (threadId) params.set('threadId', String(threadId).trim());
  if (runId) params.set('runId', String(runId).trim());
  if (status) params.set('status', String(status).trim());
  if (targetType) params.set('targetType', String(targetType).trim());
  if (targetId) params.set('targetId', String(targetId).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/proposed-changes${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { proposedChanges: [] };
};

export const updateAgentProposedChange = async (proposedChangeId, payload = {}) => {
  const safeId = encodeURIComponent(String(proposedChangeId || '').trim());
  const res = await api.patch(`/api/agent/proposed-changes/${safeId}`, payload, getAuthHeaders());
  return res.data || {};
};

export const acceptAgentProposedChange = async (proposedChangeId) => {
  const safeId = encodeURIComponent(String(proposedChangeId || '').trim());
  const res = await api.post(`/api/agent/proposed-changes/${safeId}/accept`, {}, getAuthHeaders());
  return res.data || {};
};

export const rejectAgentProposedChange = async (proposedChangeId) => {
  const safeId = encodeURIComponent(String(proposedChangeId || '').trim());
  const res = await api.post(`/api/agent/proposed-changes/${safeId}/reject`, {}, getAuthHeaders());
  return res.data || {};
};

export const rollbackAgentProposedChange = async (proposedChangeId) => {
  const safeId = encodeURIComponent(String(proposedChangeId || '').trim());
  const res = await api.post(`/api/agent/proposed-changes/${safeId}/rollback`, {}, getAuthHeaders());
  return res.data || {};
};

export const listAgentStructureProposals = async ({
  threadId = '',
  runId = '',
  status = 'all',
  scope = '',
  scopeRef = '',
  limit = 40
} = {}) => {
  const params = new URLSearchParams();
  if (threadId) params.set('threadId', String(threadId).trim());
  if (runId) params.set('runId', String(runId).trim());
  if (status) params.set('status', String(status).trim());
  if (scope) params.set('scope', String(scope).trim());
  if (scopeRef) params.set('scopeRef', String(scopeRef).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/structure-proposals${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { proposals: [] };
};

export const updateAgentStructureProposal = async (structureProposalId, payload = {}) => {
  const safeId = encodeURIComponent(String(structureProposalId || '').trim());
  const res = await api.patch(`/api/agent/structure-proposals/${safeId}`, payload, getAuthHeaders());
  return res.data || {};
};

export const applyAgentStructureProposal = async (structureProposalId) => {
  const safeId = encodeURIComponent(String(structureProposalId || '').trim());
  const res = await api.post(`/api/agent/structure-proposals/${safeId}/apply`, {}, getAuthHeaders());
  return res.data || {};
};

export const rejectAgentStructureProposal = async (structureProposalId) => {
  const safeId = encodeURIComponent(String(structureProposalId || '').trim());
  const res = await api.post(`/api/agent/structure-proposals/${safeId}/reject`, {}, getAuthHeaders());
  return res.data || {};
};

export const rollbackAgentStructureProposal = async (structureProposalId) => {
  const safeId = encodeURIComponent(String(structureProposalId || '').trim());
  const res = await api.post(`/api/agent/structure-proposals/${safeId}/rollback`, {}, getAuthHeaders());
  return res.data || {};
};

export const getAgentHarnessMetrics = async ({
  threadId = ''
} = {}) => {
  const params = new URLSearchParams();
  if (threadId) params.set('threadId', String(threadId).trim());
  const suffix = params.toString();
  const res = await api.get(`/api/agent/harness-metrics${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { metrics: null };
};

export const getAgentWriteBoundary = async ({
  threadId = '',
  workspaceType = '',
  workspaceId = '',
  limit = 5
} = {}) => {
  const params = new URLSearchParams();
  if (threadId) params.set('threadId', String(threadId).trim());
  if (workspaceType) params.set('workspaceType', String(workspaceType).trim());
  if (workspaceId) params.set('workspaceId', String(workspaceId).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/write-boundary${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { summary: null };
};

export const listAgentThreads = async ({
  status = 'active',
  scopeType = '',
  scopeId = '',
  handoffId = '',
  limit = 40
} = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', String(status).trim());
  if (scopeType) params.set('scopeType', String(scopeType).trim());
  if (scopeId) params.set('scopeId', String(scopeId).trim());
  if (handoffId) params.set('handoffId', String(handoffId).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/threads${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { threads: [] };
};

export const createAgentThread = async (payload = {}) => {
  const res = await api.post('/api/agent/threads', payload, getAuthHeaders());
  return res.data || {};
};

export const getAgentThread = async (threadId) => {
  const safeId = encodeURIComponent(String(threadId || '').trim());
  const res = await api.get(`/api/agent/threads/${safeId}`, getAuthHeaders());
  return res.data || {};
};

export const updateAgentThread = async (threadId, payload = {}) => {
  const safeId = encodeURIComponent(String(threadId || '').trim());
  const res = await api.patch(`/api/agent/threads/${safeId}`, payload, getAuthHeaders());
  return res.data || {};
};

export const appendAgentThreadMessage = async (threadId, payload = {}) => {
  const safeId = encodeURIComponent(String(threadId || '').trim());
  const res = await api.post(`/api/agent/threads/${safeId}/messages`, payload, getAuthHeaders());
  return res.data || {};
};

export const convertAgentThreadToHandoff = async (threadId, payload = {}) => {
  const safeId = encodeURIComponent(String(threadId || '').trim());
  const res = await api.post(`/api/agent/threads/${safeId}/convert-to-handoff`, payload, getAuthHeaders());
  return res.data || {};
};

export const listAgentHandoffs = async ({
  status = 'all',
  taskType = '',
  requestedActorType = '',
  requestedActorId = '',
  mine = false,
  actorType = '',
  actorId = '',
  limit = 40
} = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', String(status).trim());
  if (taskType) params.set('taskType', String(taskType).trim());
  if (requestedActorType) params.set('requestedActorType', String(requestedActorType).trim());
  if (requestedActorId) params.set('requestedActorId', String(requestedActorId).trim());
  if (mine) params.set('mine', 'true');
  if (actorType) params.set('actorType', String(actorType).trim());
  if (actorId) params.set('actorId', String(actorId).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/protocol/handoffs${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { handoffs: [] };
};

export const claimAgentHandoff = async (handoffId, payload = {}) => {
  const safeId = encodeURIComponent(String(handoffId || '').trim());
  const res = await api.post(`/api/agent/protocol/handoffs/${safeId}/claim`, payload, getAuthHeaders());
  return res.data || {};
};

export const completeAgentHandoff = async (handoffId, payload = {}) => {
  const safeId = encodeURIComponent(String(handoffId || '').trim());
  const res = await api.post(`/api/agent/protocol/handoffs/${safeId}/complete`, payload, getAuthHeaders());
  return res.data || {};
};

export const rejectAgentHandoff = async (handoffId, payload = {}) => {
  const safeId = encodeURIComponent(String(handoffId || '').trim());
  const res = await api.post(`/api/agent/protocol/handoffs/${safeId}/reject`, payload, getAuthHeaders());
  return res.data || {};
};

export const cancelAgentHandoff = async (handoffId, payload = {}) => {
  const safeId = encodeURIComponent(String(handoffId || '').trim());
  const res = await api.post(`/api/agent/protocol/handoffs/${safeId}/cancel`, payload, getAuthHeaders());
  return res.data || {};
};

export const ensureAgentHandoffThread = async (handoffId) => {
  const safeId = encodeURIComponent(String(handoffId || '').trim());
  const res = await api.post(`/api/agent/protocol/handoffs/${safeId}/thread`, {}, getAuthHeaders());
  return res.data || {};
};

export const createAutoAgentHandoff = async (payload = {}) => {
  const res = await api.post('/api/agent/protocol/handoffs/auto', payload, getAuthHeaders());
  return res.data || {};
};

export const listAgentUpkeepCycles = async ({
  status = 'active',
  limit = 12
} = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', String(status).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/protocol/upkeep-cycles${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { cycles: [] };
};

export const createAgentUpkeepCycle = async (payload = {}) => {
  const res = await api.post('/api/agent/protocol/upkeep-cycles', payload, getAuthHeaders());
  return res.data || {};
};

export const updateAgentUpkeepCycle = async (cycleId, payload = {}) => {
  const safeId = encodeURIComponent(String(cycleId || '').trim());
  const res = await api.patch(`/api/agent/protocol/upkeep-cycles/${safeId}`, payload, getAuthHeaders());
  return res.data || {};
};

export const resumeAgentUpkeepCycle = async (cycleId, options = {}) => {
  const safeId = encodeURIComponent(String(cycleId || '').trim());
  const payload = options?.force ? { force: true } : {};
  const res = await api.post(`/api/agent/protocol/upkeep-cycles/${safeId}/resume`, payload, getAuthHeaders());
  return res.data || {};
};

export const getAgentProtocolPolicy = async () => {
  const res = await api.get('/api/agent/protocol/policy', getAuthHeaders());
  return res.data || { policy: {} };
};

export const updateAgentProtocolPolicy = async (payload = {}) => {
  const res = await api.patch('/api/agent/protocol/policy', payload, getAuthHeaders());
  return res.data || { policy: {} };
};

export const createAgentBridgeToken = async (payload = {}) => {
  const res = await api.post('/api/agent/protocol/bridge/token', payload, getAuthHeaders());
  return res.data || {};
};

export const getAgentBridgeManifest = async (bridgeToken) => {
  const safeBridgeToken = String(bridgeToken || '').trim();
  const res = await api.get('/api/agent/protocol/bridge/manifest', {
    headers: {
      Authorization: `Bearer ${safeBridgeToken}`
    }
  });
  return res.data || {};
};

export const executeAgentBridgeMcp = async (bridgeToken, {
  method,
  params = {},
  id = 1
} = {}) => {
  const safeBridgeToken = String(bridgeToken || '').trim();
  const res = await api.post('/api/agent/protocol/bridge/mcp', {
    jsonrpc: '2.0',
    id,
    method,
    params
  }, {
    headers: {
      Authorization: `Bearer ${safeBridgeToken}`
    }
  });
  return res.data || {};
};

export const listAgentSkills = async ({
  surface = '',
  contextType = '',
  category = ''
} = {}) => {
  const params = new URLSearchParams();
  if (surface) params.set('surface', String(surface).trim());
  if (contextType) params.set('contextType', String(contextType).trim());
  if (category) params.set('category', String(category).trim());
  const suffix = params.toString();
  const res = await api.get(`/api/agent/protocol/skills${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { skills: [] };
};

export const listAgentArtifactDrafts = async ({
  status = 'pending',
  threadId = '',
  artifactType = ''
} = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', String(status).trim());
  if (threadId) params.set('threadId', String(threadId).trim());
  if (artifactType) params.set('artifactType', String(artifactType).trim());
  const suffix = params.toString();
  const res = await api.get(`/api/agent/artifacts/drafts${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { drafts: [] };
};

export const promoteAgentArtifactDraft = async (draftId) => {
  const safeId = encodeURIComponent(String(draftId || '').trim());
  const res = await api.post(`/api/agent/artifacts/drafts/${safeId}/promote`, {}, getAuthHeaders());
  return res.data || {};
};

export const updateAgentArtifactDraft = async (draftId, payload = {}) => {
  const safeId = encodeURIComponent(String(draftId || '').trim());
  const res = await api.patch(`/api/agent/artifacts/drafts/${safeId}`, payload, getAuthHeaders());
  return res.data || {};
};

export const dismissAgentArtifactDraft = async (draftId) => {
  const safeId = encodeURIComponent(String(draftId || '').trim());
  const res = await api.post(`/api/agent/artifacts/drafts/${safeId}/dismiss`, {}, getAuthHeaders());
  return res.data || {};
};

export const listAgentProtocolApprovals = async ({
  status = 'pending',
  limit = 30,
  threadId = '',
  handoffId = '',
  op = ''
} = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', String(status).trim());
  if (limit) params.set('limit', String(limit));
  if (threadId) params.set('threadId', String(threadId).trim());
  if (handoffId) params.set('handoffId', String(handoffId).trim());
  if (op) params.set('op', String(op).trim());
  const suffix = params.toString();
  const res = await api.get(`/api/agent/protocol/approvals${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { approvals: [] };
};

export const listAgentProtocolHookRuns = async ({
  phase = '',
  op = '',
  threadId = '',
  handoffId = '',
  limit = 30
} = {}) => {
  const params = new URLSearchParams();
  if (phase) params.set('phase', String(phase).trim());
  if (op) params.set('op', String(op).trim());
  if (threadId) params.set('threadId', String(threadId).trim());
  if (handoffId) params.set('handoffId', String(handoffId).trim());
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const res = await api.get(`/api/agent/protocol/hooks${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return res.data || { hookRuns: [] };
};

export const approveAgentProtocolApproval = async (approvalId, payload = {}) => {
  const safeId = encodeURIComponent(String(approvalId || '').trim());
  const res = await api.post(`/api/agent/protocol/approvals/${safeId}/approve`, payload, getAuthHeaders());
  return res.data || {};
};

export const rejectAgentProtocolApproval = async (approvalId, payload = {}) => {
  const safeId = encodeURIComponent(String(approvalId || '').trim());
  const res = await api.post(`/api/agent/protocol/approvals/${safeId}/reject`, payload, getAuthHeaders());
  return res.data || {};
};

// Notion agent fetch — POSTs the Notion fetch tool and returns the
// structured summary { status, fetched, created, updated, skipped, failed,
// errors, summary }. Per the design, this is user-triggered only.
export const fetchNotionPagesViaAgent = async ({ connectionId, limit } = {}) => {
  const res = await api.post(
    '/api/agent/tools/notion-fetch',
    { connectionId, limit },
    getAuthHeaders()
  );
  return res.data || {};
};
