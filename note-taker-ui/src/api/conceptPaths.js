import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const listConceptPaths = async () => {
  const res = await api.get('/api/concept-paths', getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const getConceptPath = async (id) => {
  const res = await api.get(`/api/concept-paths/${id}`, getAuthHeaders());
  return res.data;
};

export const createConceptPath = async (payload) => {
  const res = await api.post('/api/concept-paths', payload, getAuthHeaders());
  return res.data;
};

export const updateConceptPath = async (id, payload) => {
  const res = await api.put(`/api/concept-paths/${id}`, payload, getAuthHeaders());
  return res.data;
};

export const deleteConceptPath = async (id) => {
  const res = await api.delete(`/api/concept-paths/${id}`, getAuthHeaders());
  return res.data;
};

export const addConceptPathItem = async (pathId, payload) => {
  const res = await api.post(`/api/concept-paths/${pathId}/items`, payload, getAuthHeaders());
  return res.data;
};

export const updateConceptPathItem = async (pathId, itemRefId, payload) => {
  const res = await api.patch(`/api/concept-paths/${pathId}/items/${itemRefId}`, payload, getAuthHeaders());
  return res.data;
};

export const removeConceptPathItem = async (pathId, itemRefId) => {
  const res = await api.delete(`/api/concept-paths/${pathId}/items/${itemRefId}`, getAuthHeaders());
  return res.data;
};

export const reorderConceptPathItems = async (pathId, itemRefIds) => {
  const res = await api.patch(`/api/concept-paths/${pathId}/items/reorder`, { itemRefIds }, getAuthHeaders());
  return res.data;
};

export const updateConceptPathProgress = async (pathId, payload) => {
  const res = await api.patch(`/api/concept-paths/${pathId}/progress`, payload, getAuthHeaders());
  return res.data;
};
