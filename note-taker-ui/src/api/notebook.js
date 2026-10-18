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

export const getNotebookEntry = async (id) => {
  const res = await api.get(`/api/notebook/${encodeURIComponent(id)}`, getAuthHeaders());
  return res.data;
};

export const requestNotebookWordingOptions = async (id, { target, requestId }, { signal } = {}) => {
  const res = await api.post(
    `/api/notebook/${encodeURIComponent(id)}/workbench/wording-options`,
    { target, requestId },
    { ...getAuthHeaders(), signal }
  );
  return res.data;
};

export const updateNotebookWorkbench = async (id, workingState, expectedRevision = 0) => {
  const res = await api.put(
    `/api/notebook/${encodeURIComponent(id)}/workbench`,
    { workingState, expectedRevision },
    getAuthHeaders()
  );
  return res.data?.workingState || null;
};

// After a save: the one sentence of this note that contradicts a view the
// reader holds, or null.
export const readNoteAgainstViews = async (id) => {
  const res = await api.post(`/api/notebook/${encodeURIComponent(id)}/opposite`, {}, getAuthHeaders());
  return res.data?.line || null;
};

export const setOppositeAside = async (id, key) => {
  await api.post(`/api/notebook/${encodeURIComponent(id)}/opposite/${encodeURIComponent(key)}/aside`, {}, getAuthHeaders());
};

export const createNotebookEntry = async (payload) => {
  const res = await api.post('/api/notebook', payload, getAuthHeaders());
  summariesCache.reset();
  thinkShelfCache.reset();
  return res.data;
};

export const updateNotebookEntry = async (id, payload) => {
  const res = await api.put(`/api/notebook/${encodeURIComponent(id)}`, payload, getAuthHeaders());
  summariesCache.reset();
  thinkShelfCache.reset();
  return res.data;
};

export const exportNotebookMarkdown = async (id) => {
  const res = await api.get(`/api/export/notebook/${encodeURIComponent(id)}`, {
    ...getAuthHeaders(),
    responseType: 'blob'
  });
  return res.data;
};

export const disposeNotebookSourceCorrection = async (id, { eventId, action }) => {
  const res = await api.post(`/api/notebook/${encodeURIComponent(id)}/source-correction`, {
    eventId,
    action
  }, getAuthHeaders());
  return res.data;
};

/* Every note, compact, with where it stands; the board is never stale cache. */
export const getNotebookBoard = async () => {
  const res = await api.get('/api/notebook?summary=1&compact=1', getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const moveNotebookEntry = async (id, board) => {
  const res = await api.patch(`/api/notebook/${encodeURIComponent(id)}/board`, board, getAuthHeaders());
  return res.data?.board || null;
};
