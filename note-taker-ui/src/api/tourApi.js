import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const fetchTourState = async () => {
  const response = await api.get('/api/tour/state', getAuthHeaders());
  return response.data || {};
};

export const updateTourState = async (payload = {}) => {
  const response = await api.put('/api/tour/state', payload, getAuthHeaders());
  return response.data || {};
};

export const postTourEvent = async ({ eventType, metadata = {} } = {}) => {
  const response = await api.post(
    '/api/tour/events',
    { eventType, metadata },
    getAuthHeaders()
  );
  return response.data || {};
};

export const resetTourState = async () => {
  const response = await api.put('/api/tour/state', { reset: true }, getAuthHeaders());
  return response.data || {};
};

const tourApi = {
  fetchTourState,
  updateTourState,
  postTourEvent,
  resetTourState
};

export default tourApi;
