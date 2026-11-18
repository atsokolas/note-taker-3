import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/* Work the reader hands to an agent before stepping away, and what came of it. */
export const handOff = async ({ ask, to, context }) => (await api.post('/api/handoffs', { ask, to, context }, getAuthHeaders())).data;
export const listHandoffs = async () => (await api.get('/api/handoffs', getAuthHeaders())).data.handoffs;
export const getHandoff = async id => (await api.get(`/api/handoffs/${id}`, getAuthHeaders())).data;
export const cancelHandoff = async id => (await api.post(`/api/handoffs/${id}/cancel`, {}, getAuthHeaders())).data;
