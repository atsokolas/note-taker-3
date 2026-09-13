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

export const getNotebookEntry = async (id) => {
  const res = await api.get(`/api/notebook/${encodeURIComponent(id)}`, getAuthHeaders());
  return res.data;
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

export const getNotebookShare = async (id) => {
  const res = await api.get(`/api/notebook/${encodeURIComponent(id)}/share`, getAuthHeaders());
  return res.data || { shared: false };
};

export const publishNotebookShare = async (id, body = {}) => {
  const res = await api.post(
    `/api/notebook/${encodeURIComponent(id)}/share`,
    body,
    getAuthHeaders()
  );
  return res.data || { shared: false };
};

export const updateNotebookShare = async (id, body = {}) => {
  const res = await api.put(
    `/api/notebook/${encodeURIComponent(id)}/share`,
    body,
    getAuthHeaders()
  );
  return res.data || { shared: false };
};

export const revokeNotebookShare = async (id) => {
  const res = await api.delete(`/api/notebook/${encodeURIComponent(id)}/share`, getAuthHeaders());
  return res.data || { revoked: true };
};

export const getPublicNotebook = async (slug) => {
  const res = await api.get(`/api/public/notebooks/${encodeURIComponent(slug)}`);
  return res.data || null;
};

export const sendNotebookCorrespondence = async (slug, body = {}) => {
  const res = await api.post(
    `/api/public/notebooks/${encodeURIComponent(slug)}/correspondence`,
    body
  );
  return res.data || { sent: true };
};
