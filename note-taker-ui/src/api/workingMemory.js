import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const listWorkingMemory = async ({ workspaceType = 'global', workspaceId = '', status = 'active' } = {}) => {
  const params = new URLSearchParams();
  params.set('workspaceType', workspaceType || 'global');
  params.set('workspaceId', workspaceId || '');
  params.set('status', status || 'active');
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

export const archiveWorkingMemory = async (ids = []) => {
  const safeIds = Array.isArray(ids) ? ids : [ids];
  const res = await api.post('/api/working-memory/archive', { ids: safeIds }, getAuthHeaders());
  return res.data;
};

export const unarchiveWorkingMemory = async (ids = []) => {
  const safeIds = Array.isArray(ids) ? ids : [ids];
  const res = await api.post('/api/working-memory/unarchive', { ids: safeIds }, getAuthHeaders());
  return res.data;
};

export const splitWorkingMemory = async (id, mode = 'sentence') => {
  const res = await api.post(`/api/working-memory/${id}/split`, { mode }, getAuthHeaders());
  return res.data;
};

export const promoteWorkingMemory = async ({
  target,
  ids = [],
  title = '',
  tags = [],
  conceptName = '',
  questionId = '',
  questionText = ''
} = {}) => {
  const safeTarget = String(target || '').trim().toLowerCase();
  if (!safeTarget) {
    throw new Error('target is required');
  }
  const payload = {
    ids: Array.isArray(ids) ? ids : [ids],
    title,
    tags,
    conceptName,
    questionId,
    questionText
  };
  const res = await api.post(`/api/working-memory/promote/${safeTarget}`, payload, getAuthHeaders());
  return res.data;
};
