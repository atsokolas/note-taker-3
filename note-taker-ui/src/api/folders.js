import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearCached, fetchWithCache } from '../utils/cache';

/**
 * @typedef {Object} Folder
 * @property {string} _id
 * @property {string} name
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
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
