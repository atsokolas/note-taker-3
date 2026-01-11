import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/**
 * @typedef {Object} Concept
 * @property {string} name
 * @property {string} description
 * @property {number} [count]
 * @property {Array} [pinnedHighlightIds]
 * @property {Array} [pinnedArticleIds]
 * @property {Array} [pinnedNoteIds]
 * @property {Array<{ tag: string, count: number }>} [relatedTags]
 * @property {Array<{ _id: string, title: string, url?: string, createdAt?: string }>} [pinnedArticles]
 */

export const getConcepts = async () => {
  const res = await api.get('/api/concepts', getAuthHeaders());
  return res.data || [];
};

export const getConcept = async (name) => {
  const res = await api.get(`/api/concepts/${encodeURIComponent(name)}`, getAuthHeaders());
  return res.data;
};

export const updateConcept = async (name, payload) => {
  const res = await api.put(`/api/concepts/${encodeURIComponent(name)}`, payload, getAuthHeaders());
  return res.data;
};

export const updateConceptPins = async (name, payload) => {
  const res = await api.put(`/api/concepts/${encodeURIComponent(name)}/pins`, payload, getAuthHeaders());
  return res.data;
};

export const getConceptRelated = async (name, { limit = 20, offset = 0 } = {}) => {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const res = await api.get(`/api/concepts/${encodeURIComponent(name)}/related?${params.toString()}`, getAuthHeaders());
  return res.data;
};
