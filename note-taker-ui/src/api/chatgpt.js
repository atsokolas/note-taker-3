import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const getChatGPTConsentRequest = async (id) => {
  const response = await api.get(`/api/chatgpt/oauth/requests/${encodeURIComponent(id)}`, getAuthHeaders());
  return response.data;
};

export const decideChatGPTConsent = async (id, approved) => {
  const response = await api.post(`/api/chatgpt/oauth/requests/${encodeURIComponent(id)}/consent`, { approved }, getAuthHeaders());
  return response.data;
};
