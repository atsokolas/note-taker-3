import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const safeTemplateId = (templateId) => encodeURIComponent(String(templateId || '').trim());

export const listWorkspaceTemplates = async () => {
  const res = await api.get('/api/templates', getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const getWorkspaceTemplateDefinition = async (templateId) => {
  const safe = safeTemplateId(templateId);
  const res = await api.get(`/api/templates/${safe}/create`, getAuthHeaders());
  if (res.data?.template && typeof res.data.template === 'object') {
    return res.data.template;
  }
  return null;
};

export const createWorkspaceFromTemplate = async (templateId, payload = {}) => {
  const safe = safeTemplateId(templateId);
  const res = await api.post(`/api/templates/${safe}/create`, payload, getAuthHeaders());
  return res.data || null;
};
