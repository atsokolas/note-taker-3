import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const listReturnQueue = async ({ filter = 'all' } = {}) => {
  const params = new URLSearchParams();
  params.set('filter', filter || 'all');
  const res = await api.get(`/api/return-queue?${params.toString()}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const createReturnQueueEntry = async (payload) => {
  const res = await api.post('/api/return-queue', payload, getAuthHeaders());
  return res.data;
};

export const updateReturnQueueEntry = async (id, payload) => {
  const res = await api.patch(`/api/return-queue/${id}`, payload, getAuthHeaders());
  return res.data;
};
