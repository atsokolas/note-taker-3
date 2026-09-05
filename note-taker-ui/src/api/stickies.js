import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const listStickies = async ({ targetType = '', targetId = '' } = {}) => {
  const params = new URLSearchParams();
  if (targetType) params.set('targetType', targetType);
  if (targetId) params.set('targetId', targetId);
  const res = await api.get(`/api/stickies?${params.toString()}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const createSticky = async ({ text = '', targetType = '', targetId = '', targetTitle = '', targetHref = '', dueAt = null } = {}) => {
  const res = await api.post('/api/stickies', {
    text, targetType, targetId, targetTitle, targetHref, dueAt
  }, getAuthHeaders());
  return res.data;
};

export const deleteSticky = async (id) => {
  const res = await api.delete(`/api/stickies/${encodeURIComponent(id)}`, getAuthHeaders());
  return res.data;
};
