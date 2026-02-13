import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const normalizeScope = (scope = {}) => {
  const workspaceType = String(scope.workspaceType || 'global').trim().toLowerCase() || 'global';
  const workspaceId = workspaceType === 'global'
    ? ''
    : String(scope.workspaceId || '').trim();
  return { workspaceType, workspaceId };
};

export const fetchUiSettings = async (scope = {}) => {
  const normalizedScope = normalizeScope(scope);
  const response = await api.get('/api/ui-settings', {
    ...getAuthHeaders(),
    params: normalizedScope
  });
  return response.data;
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
  return response.data;
};

const uiSettingsApi = {
  fetchUiSettings,
  saveUiSettings
};

export default uiSettingsApi;
