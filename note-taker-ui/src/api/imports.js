import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const createImportSession = async (payload = {}) => {
  const response = await api.post('/api/import/sessions', payload, getAuthHeaders());
  return response.data?.session || null;
};

export const getImportSession = async (id) => {
  const safeId = String(id || '').trim();
  if (!safeId) return null;
  const response = await api.get(`/api/import/sessions/${encodeURIComponent(safeId)}`, getAuthHeaders());
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

export const listImportConnections = async ({ provider = '' } = {}) => {
  const params = new URLSearchParams();
  if (provider) params.set('provider', String(provider).trim());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await api.get(`/api/import/connections${suffix}`, getAuthHeaders());
  return Array.isArray(response.data?.connections) ? response.data.connections : [];
};

export const connectReadwiseToken = async ({ apiToken, accountLabel = '' } = {}) => {
  const response = await api.post('/api/import/readwise/connect', { apiToken, accountLabel }, getAuthHeaders());
  return response.data?.connection || null;
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
