import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const createImportSession = async (payload = {}) => {
  const response = await api.post('/api/import/sessions', payload, getAuthHeaders());
  return response.data?.session || null;
};

export const getActiveImportSession = async () => {
  const response = await api.get('/api/import/sessions/active', getAuthHeaders());
  return response.data?.session || null;
};

export const listImportSessions = async ({ status = '', provider = '', limit = 10 } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', String(status).trim());
  if (provider) params.set('provider', String(provider).trim());
  params.set('limit', String(limit));
  const response = await api.get(`/api/import/sessions?${params.toString()}`, getAuthHeaders());
  return Array.isArray(response.data?.sessions) ? response.data.sessions : [];
};

export const updateImportSession = async (id, payload = {}) => {
  const safeId = String(id || '').trim();
  if (!safeId) return null;
  const response = await api.patch(`/api/import/sessions/${encodeURIComponent(safeId)}`, payload, getAuthHeaders());
  return response.data?.session || null;
};

export const importPastedText = async ({ text, title = '', url = '' } = {}) => {
  const response = await api.post('/api/import/text', { text, title, url }, getAuthHeaders());
  return response.data || {};
};

export const importPastedUrl = async ({ url, title = '', placement, folderId } = {}) => {
  const response = await api.post('/api/import/url', { url, title, placement, folderId }, getAuthHeaders());
  return response.data || {};
};

/* A book you are starting: found if an import already brought it, made if not. */
export const startBook = async ({ title, author = '' } = {}) => {
  const response = await api.post('/api/import/book', { title, author }, getAuthHeaders());
  return response.data || {};
};

/* Today as this reader's calendar has it ("2026-10-19"). A book is closed
   on a day, not at a moment, so its anniversary is that day wherever you are. */
const today = (now = new Date()) => new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/* Closing a book with the one sentence you will remember, or none; and
   opening it again when you are still reading it after all. */
export const closeBook = async (id, line = '') => (
  (await api.put(`/api/books/${encodeURIComponent(id)}/closed`, { line, on: today() }, getAuthHeaders())).data
);
export const reopenBook = async (id) => (
  (await api.delete(`/api/books/${encodeURIComponent(id)}/closed`, getAuthHeaders())).data
);
/* Starting a finished book again: the reading you closed is kept, with its marks. */
export const readAgain = async (id) => (
  (await api.post(`/api/books/${encodeURIComponent(id)}/again`, {}, getAuthHeaders())).data
);

/* Every book on the shelf, with its marks. */
export const listBooks = async () => (
  (await api.get(`/api/books?today=${today()}`, getAuthHeaders())).data?.books || []
);

export const listImportConnections = async ({ provider = '' } = {}) => {
  const params = new URLSearchParams();
  if (provider) params.set('provider', String(provider).trim());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await api.get(`/api/import/connections${suffix}`, getAuthHeaders());
  return Array.isArray(response.data?.connections) ? response.data.connections : [];
};

export const disconnectImportConnection = async (connectionId) => {
  const safeId = encodeURIComponent(String(connectionId || '').trim());
  if (!safeId) throw new Error('Connection id is required.');
  const response = await api.post(
    `/api/import/connections/${safeId}/disconnect`,
    {},
    getAuthHeaders()
  );
  return response.data || {};
};

export const connectReadwiseToken = async ({ apiToken, accountLabel = '' } = {}) => {
  const response = await api.post('/api/import/readwise/connect', { apiToken, accountLabel }, getAuthHeaders());
  return response.data?.connection || null;
};

export const startReadwiseOAuth = async () => {
  const response = await api.post('/api/import/readwise/oauth/start', {}, getAuthHeaders());
  return response.data?.authUrl || '';
};

export const checkReadwiseConnection = async ({ connectionId } = {}) => {
  const response = await api.post('/api/import/readwise/check', { connectionId }, getAuthHeaders());
  return response.data || {};
};

export const syncReadwiseConnection = async ({ connectionId, importSessionId = '', fullSync = false } = {}) => {
  const response = await api.post('/api/import/readwise/sync', {
    connectionId,
    importSessionId,
    fullSync
  }, getAuthHeaders());
  return response.data || {};
};

export const previewReadwiseConnection = async ({ connectionId, importSessionId = '' } = {}) => {
  const response = await api.post('/api/import/readwise/preview', {
    connectionId,
    importSessionId
  }, getAuthHeaders());
  return response.data || {};
};

export const startNotionOAuth = async () => {
  const response = await api.post('/api/import/notion/oauth/start', {}, getAuthHeaders());
  return response.data?.authUrl || '';
};

export const checkNotionConnection = async ({ connectionId } = {}) => {
  const response = await api.post('/api/import/notion/check', { connectionId }, getAuthHeaders());
  return response.data || {};
};

export const syncNotionConnection = async ({ connectionId, importSessionId = '' } = {}) => {
  const response = await api.post('/api/import/notion/sync', {
    connectionId,
    importSessionId
  }, getAuthHeaders());
  return response.data || {};
};

export const previewNotionConnection = async ({ connectionId, importSessionId = '' } = {}) => {
  const response = await api.post('/api/import/notion/preview', {
    connectionId,
    importSessionId
  }, getAuthHeaders());
  return response.data || {};
};

export const exportToNotionPage = async ({
  connectionId,
  entityType,
  notebookEntryId = '',
  conceptName = '',
  parentPageId = ''
} = {}) => {
  const response = await api.post('/api/export/notion/page', {
    connectionId,
    entityType,
    notebookEntryId,
    conceptName,
    parentPageId
  }, getAuthHeaders());
  return response.data || {};
};
