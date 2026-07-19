import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const safe = (value) => encodeURIComponent(String(value || '').trim());

export const getDailyLoop = async () => {
  const response = await api.get('/api/daily-loop', getAuthHeaders());
  return response.data || {};
};

export const recordWikiPageVisit = async (pageId) => {
  const response = await api.post(`/api/daily-loop/page-visits/${safe(pageId)}`, {}, getAuthHeaders());
  return response.data || {};
};

export const recordClaimCheckIn = async ({ pageId, claimId, action, note = '', revisedText = '' }) => {
  const response = await api.post(
    `/api/daily-loop/check-ins/${safe(pageId)}/${safe(claimId)}`,
    { action, note, revisedText },
    getAuthHeaders()
  );
  return response.data || {};
};

export const getMorningPaperSettings = async () => {
  const response = await api.get('/api/morning-paper/settings', getAuthHeaders());
  return response.data?.settings || {};
};

export const updateMorningPaperSettings = async (patch = {}) => {
  const response = await api.patch('/api/morning-paper/settings', patch, getAuthHeaders());
  return response.data?.settings || {};
};

export const armReadingWatch = async (pageId, { feedUrl, label = '' } = {}) => {
  const response = await api.post(`/api/wiki/pages/${safe(pageId)}/reading-watch`, { feedUrl, label }, getAuthHeaders());
  return response.data || {};
};

export const checkReadingWatch = async (pageId) => {
  const response = await api.post(`/api/wiki/pages/${safe(pageId)}/reading-watch/check`, {}, getAuthHeaders());
  return response.data || {};
};

export const disarmWatcher = async (pageId, type) => {
  const response = await api.post(`/api/daily-loop/watchers/${safe(pageId)}/${safe(type)}/disarm`, {}, getAuthHeaders());
  return response.data || {};
};
