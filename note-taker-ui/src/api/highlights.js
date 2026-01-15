import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/**
 * @typedef {Object} Highlight
 * @property {string} _id
 * @property {string} text
 * @property {string[]} [tags]
 * @property {string} articleId
 * @property {string} [articleTitle]
 * @property {string} [createdAt]
 */

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
  return res.data?.highlight || res.data;
};

export const createHighlight = async ({ articleId, text, tags = [], anchor }) => {
  const res = await api.post(
    `/articles/${articleId}/highlights`,
    { text, tags, anchor },
    getAuthHeaders()
  );
  return res.data?.highlight || res.data?.createdHighlight || res.data;
};
