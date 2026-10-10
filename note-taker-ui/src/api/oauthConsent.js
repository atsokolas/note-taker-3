import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const getConsentRequest = async (id) => {
  const response = await api.get(`/api/chatgpt/oauth/requests/${encodeURIComponent(id)}`, getAuthHeaders());
  return response.data;
};

// `scopes` may narrow what the app asked for (read only); the server refuses anything wider.
export const decideConsent = async (id, approved, scopes) => {
  const response = await api.post(`/api/chatgpt/oauth/requests/${encodeURIComponent(id)}/consent`, scopes ? { approved, scopes } : { approved }, getAuthHeaders());
  return response.data;
};
