import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearCached, fetchWithCache } from '../utils/cache';

const NOTEBOOK_SUMMARIES_CACHE_KEY = 'notebook.summaries';
const NOTEBOOK_FOLDERS_CACHE_KEY = 'notebook.folders';
const NOTEBOOK_CACHE_TTL_MS = 30_000;

export const clearNotebookCache = () => {
  clearCached(NOTEBOOK_SUMMARIES_CACHE_KEY);
  clearCached(NOTEBOOK_FOLDERS_CACHE_KEY);
};

export const getNotebookSummaries = async ({ force = false } = {}) => fetchWithCache(
  NOTEBOOK_SUMMARIES_CACHE_KEY,
  async () => {
    const res = await api.get('/api/notebook?summary=1', getAuthHeaders());
    return res.data || [];
  },
  { force, ttlMs: NOTEBOOK_CACHE_TTL_MS }
);

export const getNotebookFolders = async ({ force = false } = {}) => fetchWithCache(
  NOTEBOOK_FOLDERS_CACHE_KEY,
  async () => {
    const res = await api.get('/api/notebook/folders', getAuthHeaders());
    return res.data || [];
  },
  { force, ttlMs: NOTEBOOK_CACHE_TTL_MS }
);
