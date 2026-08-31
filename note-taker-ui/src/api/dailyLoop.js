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

export const recordClaimFalsifiability = async ({
  pageId,
  claimId = '',
  resolutionCriteria,
  horizon
} = {}) => {
  const path = claimId
    ? `/api/daily-loop/claims/${safe(pageId)}/${safe(claimId)}/criteria`
    : `/api/daily-loop/claims/${safe(pageId)}/criteria`;
  const response = await api.post(
    path,
    { claimId, resolutionCriteria, horizon },
    getAuthHeaders()
  );
  return response.data || {};
};

export const recordClaimVerdict = async ({
  pageId,
  claimId,
  verdict,
  trigger,
  sourceEventId = '',
  note = ''
} = {}) => {
  const response = await api.post(
    `/api/daily-loop/verdicts/${safe(pageId)}/${safe(claimId)}`,
    { verdict, trigger, sourceEventId, note },
    getAuthHeaders()
  );
  return response.data || {};
};

export const getJudgmentMirror = async ({ stat = '' } = {}) => {
  const query = stat ? `?stat=${encodeURIComponent(stat)}` : '';
  const response = await api.get(`/api/judgment/mirror${query}`, getAuthHeaders());
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

export const disarmWatcher = async (pageId, type) => {
  const response = await api.post(`/api/daily-loop/watchers/${safe(pageId)}/${safe(type)}/disarm`, {}, getAuthHeaders());
  return response.data || {};
};
