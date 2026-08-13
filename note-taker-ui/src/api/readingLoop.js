import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const safe = (value) => encodeURIComponent(String(value || '').trim());

export const getReadingLoop = async () => {
  const response = await api.get('/api/reading-loop', getAuthHeaders());
  return response.data || {};
};

export const runReadingLoopMechanic = async (kind) => {
  const response = await api.post(`/api/reading-loop/run/${safe(kind)}`, {}, getAuthHeaders());
  return response.data?.mechanic || null;
};

export const refreshReadingLoopConnection = async () => {
  const response = await api.post('/api/reading-loop/connection/refresh', {}, getAuthHeaders());
  return response.data?.mechanic || null;
};

export const dismissReadingLoopThread = async (threadKey) => {
  const response = await api.post('/api/reading-loop/thread/dismiss', { threadKey }, getAuthHeaders());
  return response.data?.mechanic || null;
};
