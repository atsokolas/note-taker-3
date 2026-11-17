import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/* The questions the reader expects their library to answer, and whether
   recall still finds the sources they named. */
export const listKnows = async () => (await api.get('/api/knows', getAuthHeaders())).data;
export const addKnows = async ({ question, expects }) => (await api.post('/api/knows', { question, expects }, getAuthHeaders())).data;
export const dropKnows = async id => api.delete(`/api/knows/${id}`, getAuthHeaders());
export const recallFor = async q => (await api.get('/api/recall', { ...getAuthHeaders(), params: { q, limit: 8 } })).data.results;
