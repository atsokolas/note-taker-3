import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const listWorkingMemory = async ({ workspaceType = 'global', workspaceId = '' } = {}) => {
  const params = new URLSearchParams();
  params.set('workspaceType', workspaceType || 'global');
  params.set('workspaceId', workspaceId || '');
  const res = await api.get(`/api/working-memory?${params.toString()}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const createWorkingMemory = async (payload) => {
  const res = await api.post('/api/working-memory', payload, getAuthHeaders());
  return res.data;
};

export const deleteWorkingMemory = async (id) => {
  const res = await api.delete(`/api/working-memory/${id}`, getAuthHeaders());
  return res.data;
};
