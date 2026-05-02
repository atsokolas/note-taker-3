import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearCachedPrefix, fetchWithCache } from '../utils/cache';

/**
 * @typedef {Object} Article
 * @property {string} _id
 * @property {string} title
 * @property {string} url
 * @property {string} createdAt
 * @property {{ _id: string, name: string } | null} [folder]
 * @property {Array} [highlights]
 */

/**
 * @param {Object} params
 * @param {'all'|'unfiled'|'folder'} [params.scope]
 * @param {string} [params.folderId]
 * @param {string} [params.query]
 * @param {'recent'|'oldest'|'most-highlighted'} [params.sort]
 * @param {string} [params.cursor]
 * @param {number} [params.limit]
 */
export const getArticles = async ({
  scope = 'all',
  folderId = '',
  query = '',
  sort = 'recent',
  cursor,
  limit
} = {}) => {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (folderId) params.set('folderId', folderId);
  if (query) params.set('query', query);
  if (sort) params.set('sort', sort);
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString();
  const path = `/api/articles${suffix ? `?${suffix}` : ''}`;
  return fetchWithCache(
    `articles:${path}`,
    async () => {
      const res = await api.get(path, getAuthHeaders());
      return res.data || [];
    },
    { ttlMs: 30_000 }
  );
};

export const moveArticleToFolder = async (articleId, folderId) => {
  const res = await api.patch(
    `/articles/${articleId}/move`,
    { folderId: folderId || 'uncategorized' },
    getAuthHeaders()
  );
  clearCachedPrefix('articles:');
  return res.data;
};
