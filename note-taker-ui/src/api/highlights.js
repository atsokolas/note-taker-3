import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearCached, fetchWithCache } from '../utils/cache';

/**
 * @typedef {Object} Highlight
 * @property {string} _id
 * @property {string} text
 * @property {string[]} [tags]
 * @property {string} [color]
 * @property {'claim'|'evidence'|'note'} [type]
 * @property {string|null} [claimId]
 * @property {string} articleId
 * @property {string} [articleTitle]
 * @property {string} [createdAt]
 */

const ALL_HIGHLIGHTS_CACHE_KEY = 'highlights.all';
const ALL_HIGHLIGHTS_CACHE_TTL_MS = 30_000;

export const clearHighlightsCache = () => clearCached(ALL_HIGHLIGHTS_CACHE_KEY);

export const getAllHighlights = async ({ force = false } = {}) => fetchWithCache(
  ALL_HIGHLIGHTS_CACHE_KEY,
  async () => {
    const res = await api.get('/api/highlights/all', getAuthHeaders());
    return res.data || [];
  },
  { force, ttlMs: ALL_HIGHLIGHTS_CACHE_TTL_MS }
);

export const getHighlights = async ({ folderId, tag, articleId, q, cursor, limit } = {}) => {
  const params = new URLSearchParams();
  if (folderId) params.set('folderId', folderId);
  if (tag) params.set('tag', tag);
  if (articleId) params.set('articleId', articleId);
  if (q) params.set('q', q);
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  const res = await api.get(`/api/highlights${query ? `?${query}` : ''}`, getAuthHeaders());
  return res.data || [];
};

export const updateHighlightTags = async ({ articleId, highlightId, tags = [] }) => {
  const res = await api.patch(`/articles/${articleId}/highlights/${highlightId}`, { tags }, getAuthHeaders());
  clearHighlightsCache();
  return res.data?.highlight || res.data;
};

export const updateHighlight = async ({ articleId, highlightId, payload = {} }) => {
  const res = await api.patch(
    `/articles/${articleId}/highlights/${highlightId}`,
    payload,
    getAuthHeaders()
  );
  clearHighlightsCache();
  return res.data?.highlight || res.data;
};

export const deleteHighlight = async ({ articleId, highlightId }) => {
  const res = await api.delete(`/articles/${articleId}/highlights/${highlightId}`, getAuthHeaders());
  clearHighlightsCache();
  return res.data;
};

export const createHighlight = async ({ articleId, text, tags = [], note = '', anchor, color }) => {
  const res = await api.post(
    `/articles/${articleId}/highlights`,
    { text, tags, note, anchor, color },
    getAuthHeaders()
  );
  clearHighlightsCache();
  return res.data?.highlight || res.data?.createdHighlight || res.data;
};
