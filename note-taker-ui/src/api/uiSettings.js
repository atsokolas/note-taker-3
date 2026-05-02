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

export const fetchUiSettings = async (scope = {}) => {
  const normalizedScope = normalizeScope(scope);
  const cacheKey = `ui-settings:${normalizedScope.workspaceType}:${normalizedScope.workspaceId}`;
  return fetchWithCache(
    cacheKey,
    async () => {
      const response = await api.get('/api/ui-settings', {
        ...getAuthHeaders(),
        params: normalizedScope
      });
      return response.data;
    },
    { ttlMs: 30_000 }
  );
};

export const saveUiSettings = async (settings, scope = {}) => {
  const normalizedScope = normalizeScope(scope);
  const response = await api.put(
    '/api/ui-settings',
    {
      ...settings,
      ...normalizedScope
    },
    getAuthHeaders()
  );
  clearCached(`ui-settings:${normalizedScope.workspaceType}:${normalizedScope.workspaceId}`);
  return response.data;
};

const uiSettingsApi = {
  fetchUiSettings,
  saveUiSettings
};

export default uiSettingsApi;
