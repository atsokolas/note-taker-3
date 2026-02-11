import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const createConnection = async (payload) => {
  const res = await api.post('/api/connections', payload, getAuthHeaders());
  return res.data;
};

export const getConnectionsForItem = async ({ itemType, itemId, scopeType = '', scopeId = '' }) => {
  const params = new URLSearchParams();
  params.set('itemType', itemType);
  params.set('itemId', itemId);
  if (scopeType) params.set('scopeType', scopeType);
  if (scopeId) params.set('scopeId', scopeId);
  const res = await api.get(`/api/connections?${params.toString()}`, getAuthHeaders());
  return res.data || { outgoing: [], incoming: [] };
};

export const deleteConnection = async (id) => {
  const res = await api.delete(`/api/connections/${id}`, getAuthHeaders());
  return res.data;
};

export const searchConnectableItems = async ({
  q = '',
  excludeType = '',
  excludeId = '',
  limit = 15,
  scopeType = '',
  scopeId = ''
} = {}) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (excludeType) params.set('excludeType', excludeType);
  if (excludeId) params.set('excludeId', excludeId);
  if (scopeType) params.set('scopeType', scopeType);
  if (scopeId) params.set('scopeId', scopeId);
  params.set('limit', String(limit));
  const res = await api.get(`/api/connections/search?${params.toString()}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const getConnectionsForScope = async ({ scopeType, scopeId, limit = 40 }) => {
  const params = new URLSearchParams();
  params.set('scopeType', scopeType);
  params.set('scopeId', scopeId);
  params.set('limit', String(limit));
  const res = await api.get(`/api/connections/scope?${params.toString()}`, getAuthHeaders());
  return res.data || { connections: [] };
};
