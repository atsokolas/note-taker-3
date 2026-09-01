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
 * @param {boolean} [params.includeSuppressed]
 */
export const getArticles = async ({
  scope = 'all',
  folderId = '',
  query = '',
  sort = 'recent',
  cursor,
  limit,
  includeSuppressed = false,
  includePreview = false
} = {}) => {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (folderId) params.set('folderId', folderId);
  if (query) params.set('query', query);
  if (sort) params.set('sort', sort);
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  if (includeSuppressed) params.set('includeSuppressed', 'true');
  if (includePreview) params.set('includePreview', 'true');
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

/* A note needs only the reader's Keep decision, not the source body. Keeping
   this projection separate prevents Think from downloading an article merely
   to draw one quiet provenance word. */
export const getArticleEvergreen = async (articleId) => {
  const res = await api.get(`/articles/${articleId}/evergreen`, getAuthHeaders());
  return res.data || null;
};

/* Evergreen: a source the reader keeps for life. It stops being measured
   against any clock, it answers first when a judgment asks the library what it
   holds, and it reads back on its own at /evergreen. The cache is cleared
   because every list that shows sources now shows this too. */
export const setArticleEvergreen = async (articleId, evergreen) => {
  const res = await api.patch(
    `/articles/${articleId}/evergreen`,
    { evergreen: Boolean(evergreen) },
    getAuthHeaders()
  );
  clearCachedPrefix('articles:');
  /* The Kept shelf count lives on the room projection, not the article list.
     Leaving that cache warm is how Keep for good still read as Kept 0. */
  clearCachedPrefix('library-room:');
  clearCachedPrefix('library-relevance:');
  return res.data;
};

export const setArticlePlacement = async (articleId, placement, reason = '') => {
  const res = await api.patch(
    `/articles/${articleId}/placement`,
    { placement, ...(reason ? { reason } : {}) },
    getAuthHeaders()
  );
  clearCachedPrefix('articles:');
  clearCachedPrefix('library-room:');
  clearCachedPrefix('library-relevance:');
  return res.data;
};
