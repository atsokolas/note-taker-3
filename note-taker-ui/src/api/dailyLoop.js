import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const safe = (value) => encodeURIComponent(String(value || '').trim());

export const recordWikiPageVisit = async (pageId) => {
  const response = await api.post(`/api/daily-loop/page-visits/${safe(pageId)}`, {}, getAuthHeaders());
  return response.data || {};
};

export const recordClaimCheckIn = async ({
  pageId,
  claimId,
  action,
  note = '',
  revisedText = '',
  resolutionCriteria,
  horizon
} = {}) => {
  const body = { action, note, revisedText };
  if (resolutionCriteria !== undefined) body.resolutionCriteria = resolutionCriteria;
  if (horizon !== undefined) body.horizon = horizon;
  const response = await api.post(
    `/api/daily-loop/check-ins/${safe(pageId)}/${safe(claimId)}`,
    body,
    getAuthHeaders()
  );
  return response.data || {};
};

export const getJudgmentMirror = async ({ stat = '' } = {}) => {
  const query = stat ? `?stat=${encodeURIComponent(stat)}` : '';
  const response = await api.get(`/api/judgment/mirror${query}`, getAuthHeaders());
  const data = response.data || {};
  if (data.stats || data.metrics || data.coverage) return data;
  return data.mirror || {};
};

export const getMorningPaperSettings = async () => {
  const response = await api.get('/api/morning-paper/settings', getAuthHeaders());
  return response.data?.settings || {};
};

export const updateMorningPaperSettings = async (patch = {}) => {
  const response = await api.patch('/api/morning-paper/settings', patch, getAuthHeaders());
  return response.data?.settings || {};
};
