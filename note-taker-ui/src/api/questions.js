import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/**
 * @typedef {Object} Question
 * @property {string} _id
 * @property {string} text
 * @property {string} status
 * @property {string} linkedTagName
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

export const getQuestions = async ({ status, tag } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (tag) params.set('tag', tag);
  const query = params.toString();
  const res = await api.get(`/api/questions${query ? `?${query}` : ''}`, getAuthHeaders());
  return res.data || [];
};

export const getQuestion = async (id) => {
  const res = await api.get(`/api/questions/${id}`, getAuthHeaders());
  return res.data;
};

export const getConceptQuestions = async (conceptName, { status = 'open' } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const query = params.toString();
  const res = await api.get(
    `/api/concepts/${encodeURIComponent(conceptName)}/questions${query ? `?${query}` : ''}`,
    getAuthHeaders()
  );
  return res.data || [];
};

export const createQuestion = async ({ text, conceptName, status = 'open', blocks = [] }) => {
  const payload = {
    text,
    status,
    conceptName: conceptName || '',
    linkedTagName: conceptName || '',
    blocks
  };
  const res = await api.post('/api/questions', payload, getAuthHeaders());
  return res.data;
};

export const updateQuestion = async (id, payload) => {
  const res = await api.put(`/api/questions/${id}`, payload, getAuthHeaders());
  return res.data;
};

export const getQuestionShare = async (id) => {
  const res = await api.get(`/api/questions/${encodeURIComponent(id)}/share`, getAuthHeaders());
  return res.data || { shared: false };
};

export const mintQuestionShare = async (id) => {
  const res = await api.post(`/api/questions/${encodeURIComponent(id)}/share`, {}, getAuthHeaders());
  return res.data || {};
};

export const revokeQuestionShare = async (id) => {
  const res = await api.delete(`/api/questions/${encodeURIComponent(id)}/share`, getAuthHeaders());
  return res.data || { revoked: true };
};

export const getPublicQuestion = async (slug) => {
  const res = await api.get(`/api/public/questions/${encodeURIComponent(slug)}`);
  return res.data;
};

/** @deprecated Use mintQuestionShare */
export const shareQuestion = mintQuestionShare;
