import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearCached, clearCachedPrefix, fetchWithCache } from '../utils/cache';

/**
 * @typedef {Object} Folder
 * @property {string} _id
 * @property {string} name
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 * @property {boolean} [asFeed]
 * @property {string | null} [parentFolderId]
 * @property {number} [sortOrder]
 * @property {number} [articleCount]
 */

const FOLDERS_CACHE_KEY = 'folders.withCounts';
const FOLDERS_CACHE_TTL_MS = 30_000;

export const clearFoldersCache = () => clearCached(FOLDERS_CACHE_KEY);

export const getFolders = async ({ force = false } = {}) => fetchWithCache(
  FOLDERS_CACHE_KEY,
  async () => {
    const res = await api.get('/api/folders?includeCounts=true', getAuthHeaders());
    return res.data || [];
  },
  { force, ttlMs: FOLDERS_CACHE_TTL_MS }
);

export const setFolderAsFeed = async (folderId, asFeed) => {
  const res = await api.patch(
    `/folders/${folderId}/feed`,
    { asFeed: Boolean(asFeed) },
    getAuthHeaders()
  );
  clearFoldersCache();
  clearCachedPrefix('articles:');
  clearCachedPrefix('library-room:');
  clearCachedPrefix('library-relevance:');
  return res.data;
};

/* A drawer moves inside another drawer, or back to the top when the parent
   is null. The server refuses cycles, trays, and foreign shelves; a refusal
   leaves the cabinet exactly where it was. */
export const moveFolder = async (folderId, parentFolderId) => {
  const res = await api.patch(
    `/folders/${folderId}/parent`,
    { parentFolderId: parentFolderId || null },
    getAuthHeaders()
  );
  clearFoldersCache();
  clearCachedPrefix('articles:');
  clearCachedPrefix('library-room:');
  clearCachedPrefix('library-relevance:');
  return res.data;
};

