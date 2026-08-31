import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const safe = value => encodeURIComponent(String(value || '').trim());
const requestId = () => (
  (typeof window !== 'undefined' && window.crypto?.randomUUID?.())
  || `judgment-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export const getJudgmentMirror = async () => {
  const response = await api.get('/api/judgment/mirror', getAuthHeaders());
  return response.data?.mirror || null;
};

export const setJudgmentResolution = async ({ pageId, expectedClaim, criteria, horizonAt = null }) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/resolution`,
    { requestId: requestId(), expectedClaim, criteria, horizonAt },
    getAuthHeaders()
  );
  return response.data || {};
};

export const recordJudgmentVerdict = async ({
  pageId, expectedClaim, result, note = '', evidenceSourceRefIds = []
}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/verdicts`,
    { requestId: requestId(), expectedClaim, result, note, evidenceSourceRefIds },
    getAuthHeaders()
  );
  return response.data || {};
};
