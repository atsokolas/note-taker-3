import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const createConnection = async (payload) => {
  const res = await api.post('/api/connections', payload, getAuthHeaders());
  return res.data;
};

export const getConnectionsForItem = async ({ itemType, itemId }) => {
  const params = new URLSearchParams();
  params.set('itemType', itemType);
  params.set('itemId', itemId);
  const res = await api.get(`/api/connections?${params.toString()}`, getAuthHeaders());
  return res.data || { outgoing: [], incoming: [] };
};

export const deleteConnection = async (id) => {
  const res = await api.delete(`/api/connections/${id}`, getAuthHeaders());
  return res.data;
};

export const searchConnectableItems = async ({ q = '', excludeType = '', excludeId = '', limit = 15 } = {}) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (excludeType) params.set('excludeType', excludeType);
  if (excludeId) params.set('excludeId', excludeId);
  params.set('limit', String(limit));
  const res = await api.get(`/api/connections/search?${params.toString()}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};
