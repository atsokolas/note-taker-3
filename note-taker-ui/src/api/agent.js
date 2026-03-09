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

export const createAgentHandoff = async (payload = {}) => {
  const res = await api.post('/api/agent/protocol/handoffs', payload, getAuthHeaders());
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

export const createAutoAgentHandoff = async (payload = {}) => {
  const res = await api.post('/api/agent/protocol/handoffs/auto', payload, getAuthHeaders());
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
