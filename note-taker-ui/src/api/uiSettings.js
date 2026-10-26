import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearCached, fetchWithCache } from '../utils/cache';

const normalizeScope = (scope = {}) => {
  const workspaceType = String(scope.workspaceType || 'global').trim().toLowerCase() || 'global';
  const workspaceId = workspaceType === 'global'
    ? ''
    : String(scope.workspaceId || '').trim();
  return { workspaceType, workspaceId };
};

export const fetchUiSettings = async (scope = {}, requestOptions = {}) => {
  const normalizedScope = normalizeScope(scope);
  const cacheKey = `ui-settings:${normalizedScope.workspaceType}:${normalizedScope.workspaceId}`;
  const read = async () => {
    const response = await api.get('/api/ui-settings', { ...getAuthHeaders(), ...requestOptions, params: normalizedScope });
    return response.data;
  };
  return requestOptions.skipAuthHandling ? read() : fetchWithCache(cacheKey, read, { ttlMs: 30_000 });
};

export const saveUiSettings = async (settings, scope = {}, requestOptions = {}) => {
  const normalizedScope = normalizeScope(scope);
  const response = await api.put(
    '/api/ui-settings',
    {
      ...settings,
      ...normalizedScope
    },
    { ...getAuthHeaders(), ...requestOptions }
  );
  clearCached(`ui-settings:${normalizedScope.workspaceType}:${normalizedScope.workspaceId}`);
  return response.data;
};

const uiSettingsApi = {
  fetchUiSettings,
  saveUiSettings
};

export default uiSettingsApi;
