import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const listReturnQueue = async ({ filter = 'all' } = {}) => {
  const params = new URLSearchParams();
  params.set('filter', filter || 'all');
  const res = await api.get(`/api/return-queue?${params.toString()}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

/* The daily resurface — a handful of old highlights, chosen for you. It used to
   be a tab you had to remember to open; the morning paper now says it is there.
   Same endpoint Review reads, capped the same way, so the paper's count and the
   list you land on agree. */
export const listDailyResurface = async () => {
  const res = await api.get('/api/resurface', getAuthHeaders());
  const highlights = res.data?.dailyRandomHighlights;
  return Array.isArray(highlights) ? highlights.slice(0, 5) : [];
};

export const createReturnQueueEntry = async (payload) => {
  const res = await api.post('/api/return-queue', payload, getAuthHeaders());
  return res.data;
};

export const updateReturnQueueEntry = async (id, payload) => {
  const res = await api.patch(`/api/return-queue/${id}`, payload, getAuthHeaders());
  return res.data;
};
