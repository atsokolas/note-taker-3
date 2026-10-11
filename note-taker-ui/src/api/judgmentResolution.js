import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const safe = value => encodeURIComponent(String(value || '').trim());
const requestId = () => (
  (typeof window !== 'undefined' && window.crypto?.randomUUID?.())
  || `judgment-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

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

/* A passage nobody highlighted goes by its words (quote) instead of a
   highlightId, and becomes a highlight on the way in. */
export const fileJudgmentEvidence = async ({
  pageId, expectedClaim, field, articleId, highlightId, quote
}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/evidence`,
    { requestId: requestId(), expectedClaim, field, articleId, highlightId, ...(highlightId ? {} : { quote }) },
    getAuthHeaders()
  );
  return response.data || {};
};

// The passage this source already proposed against a view you hold, if any.
export const getPushesAgainst = async (articleId) => {
  const response = await api.get(`/api/judgment/pushes-against?articleId=${safe(articleId)}`, getAuthHeaders());
  return response.data?.reading || null;
};

export const fileReadingProposal = async ({ pageId, proposalId, field }) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/evidence`,
    { proposalId, field },
    getAuthHeaders()
  );
  return response.data || {};
};
