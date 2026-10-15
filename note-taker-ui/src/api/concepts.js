import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearCached, fetchWithCache } from '../utils/cache';

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

const CONCEPTS_CACHE_KEY = 'concepts.list';
const CONCEPTS_CACHE_TTL_MS = 30_000;

export const clearConceptsCache = () => clearCached(CONCEPTS_CACHE_KEY);

export const getConcepts = async ({ force = false } = {}) => fetchWithCache(
  CONCEPTS_CACHE_KEY,
  async () => {
    const res = await api.get('/api/concepts', getAuthHeaders());
    return res.data || [];
  },
  { force, ttlMs: CONCEPTS_CACHE_TTL_MS }
);

export const getConcept = async (name) => {
  const res = await api.get(`/api/concepts/${encodeURIComponent(name)}`, getAuthHeaders());
  return res.data;
};

export const updateConcept = async (name, payload) => {
  const res = await api.put(`/api/concepts/${encodeURIComponent(name)}`, payload, getAuthHeaders());
  clearConceptsCache();
  return res.data;
};

/* Renames the concept and every reference to its name; refused (409) onto a name already in use. */
export const renameConcept = async (nameOrId, name) => {
  const res = await api.post(`/api/concepts/${encodeURIComponent(nameOrId)}/rename`, { name }, getAuthHeaders());
  clearConceptsCache();
  return res.data;
};

export const getConceptIdeaWorkbench = async (conceptIdOrName) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.get(`/api/concepts/${safe}/idea-workbench`, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', ideaWorkbench: null, ideaWorkbenchMeta: null, revision: 0, events: [] };
};

export const updateConceptIdeaWorkbench = async (conceptIdOrName, ideaWorkbench, options = {}) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const body = {
    ideaWorkbench,
    ...(options && typeof options === 'object' ? options : {})
  };
  const res = await api.put(`/api/concepts/${safe}/idea-workbench`, body, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', ideaWorkbench: null, ideaWorkbenchMeta: null, revision: 0, events: [] };
};

// Public concept share -------------------------------------------------------

export const getConceptShare = async (name) => {
  const res = await api.get(`/api/concepts/${encodeURIComponent(name)}/share`, getAuthHeaders());
  return res.data || { shared: false };
};

export const mintConceptShare = async (name, body = {}) => {
  const res = await api.post(`/api/concepts/${encodeURIComponent(name)}/share`, body, getAuthHeaders());
  return res.data || {};
};

export const updateConceptShare = async (name, body = {}) => {
  const res = await api.put(`/api/concepts/${encodeURIComponent(name)}/share`, body, getAuthHeaders());
  return res.data || {};
};

export const revokeConceptShare = async (name) => {
  const res = await api.delete(`/api/concepts/${encodeURIComponent(name)}/share`, getAuthHeaders());
  return res.data || { revoked: true };
};

// Public read — no auth headers; readable while unauthenticated.
export const getPublicConcept = async (slug) => {
  const res = await api.get(`/api/public/concepts/${encodeURIComponent(slug)}`);
  return res.data;
};
