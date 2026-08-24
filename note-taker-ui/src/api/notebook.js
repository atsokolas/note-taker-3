import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { createAuthScopedSnapshotCache } from '../system/authScopedSnapshotCache';

const NOTEBOOK_CACHE_TTL_MS = 30_000;
const THINK_SHELF_LIMIT = 120;

const summariesCache = createAuthScopedSnapshotCache({
  ttlMs: NOTEBOOK_CACHE_TTL_MS,
  load: async () => {
    const res = await api.get('/api/notebook?summary=1', getAuthHeaders());
    return res.data || [];
  },
  normalize: value => (Array.isArray(value) ? value : [])
});

const thinkShelfCache = createAuthScopedSnapshotCache({
  ttlMs: NOTEBOOK_CACHE_TTL_MS,
  load: async () => {
    const res = await api.get(`/api/notebook?summary=1&compact=1&limit=${THINK_SHELF_LIMIT}`, getAuthHeaders());
    return res.data || [];
  },
  normalize: value => (Array.isArray(value) ? value : [])
});

const foldersCache = createAuthScopedSnapshotCache({
  ttlMs: NOTEBOOK_CACHE_TTL_MS,
  load: async () => {
    const res = await api.get('/api/notebook/folders', getAuthHeaders());
    return res.data || [];
  },
  normalize: value => (Array.isArray(value) ? value : [])
});

export const clearNotebookCache = () => {
  summariesCache.reset();
  thinkShelfCache.reset();
  foldersCache.reset();
};

export const getNotebookSummaries = async ({ force = false } = {}) => summariesCache.read({ force });

export const getNotebookShelf = async ({ force = false } = {}) => thinkShelfCache.read({ force });

export const getNotebookFolders = async ({ force = false } = {}) => foldersCache.read({ force });
