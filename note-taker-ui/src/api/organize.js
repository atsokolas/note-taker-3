import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const getNotebookClaimEvidence = async (id) => {
  const res = await api.get(`/api/notebook/${id}/claim`, getAuthHeaders());
  return res.data;
};

export const searchNotebookClaims = async (query = '') => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  const suffix = params.toString();
  const res = await api.get(`/api/notebook/organize/claims${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const organizeHighlightItem = async (id, payload) => {
  const res = await api.patch(`/api/highlights/${id}/organize`, payload, getAuthHeaders());
  return res.data;
};

export const getHighlightClaimEvidence = async (id) => {
  const res = await api.get(`/api/highlights/${id}/claim`, getAuthHeaders());
  return res.data;
};

export const searchHighlightClaims = async (query = '') => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  const suffix = params.toString();
  const res = await api.get(`/api/highlights/organize/claims${suffix ? `?${suffix}` : ''}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};
