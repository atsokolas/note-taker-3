import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const safe = value => encodeURIComponent(String(value || '').trim());
const requestId = () => (
  (typeof window !== 'undefined' && window.crypto?.randomUUID?.())
  || `judgment-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export const getJudgmentMirror = async ({ stat = '' } = {}) => {
  const query = stat ? `?stat=${encodeURIComponent(stat)}` : '';
  const response = await api.get(`/api/judgment/mirror${query}`, getAuthHeaders());
  return response.data?.mirror || response.data || null;
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

export const fileJudgmentEvidence = async ({
  pageId, expectedClaim, field, articleId, highlightId
}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/evidence`,
    { requestId: requestId(), expectedClaim, field, articleId, highlightId },
    getAuthHeaders()
  );
  return response.data || {};
};

export const getJudgmentLedger = async ({ pageId, at = '' } = {}) => {
  const query = at ? `?at=${encodeURIComponent(at)}` : '';
  const response = await api.get(`/api/judgment/pages/${safe(pageId)}/ledger${query}`, getAuthHeaders());
  return response.data || {};
};

export const recordJudgmentClock = async ({
  pageId, expectedClaim, clock, occurredAt = null, precision = '', authoredBy = 'user',
  sourceRefIds = [], sourceLabel = '', summary = '', causalKind = 'evidence', relatedId = ''
}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/clocks`,
    {
      requestId: requestId(), expectedClaim, clock, occurredAt, precision, authoredBy,
      sourceRefIds, sourceLabel, summary, causalKind, relatedId
    },
    getAuthHeaders()
  );
  return response.data || {};
};

export const recordJudgmentOutcome = async ({
  pageId, expectedClaim, result = '', observedAt = null, precision = '', sourceRefIds = [],
  sourceLabel = '', confidence = '', silence = false, answer = '', lesson = '', verdictId = ''
}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/outcomes`,
    {
      requestId: requestId(), expectedClaim, result, observedAt, precision, sourceRefIds,
      sourceLabel, confidence, silence, answer, lesson, verdictId
    },
    getAuthHeaders()
  );
  return response.data || {};
};

export const resolveJudgmentLesson = async ({
  pageId, expectedClaim, applicationId = '', lessonId, sourcePageId, sourceText = '',
  status, narrowedText = '', note = '', relevance = ''
}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/lessons`,
    {
      requestId: requestId(), expectedClaim, applicationId, lessonId, sourcePageId,
      sourceText, status, narrowedText, note, relevance
    },
    getAuthHeaders()
  );
  return response.data || {};
};
export const getLivingTeam = async ({ pageId, since = '' } = {}) => {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  const response = await api.get(`/api/judgment/pages/${safe(pageId)}/team${query}`, getAuthHeaders());
  return response.data?.team || response.data || null;
};

export const grantLivingTeamSeat = async ({
  pageId, userId = '', memberPageId = '', roles = ['observe'], label = ''
} = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/team/members`,
    { requestId: requestId(), userId, memberPageId, pageId: memberPageId, roles, label },
    getAuthHeaders()
  );
  return response.data || {};
};

export const approveLivingTeamVersion = async ({ pageId, conditions = '' } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/team/approve`,
    { requestId: requestId(), conditions },
    getAuthHeaders()
  );
  return response.data || {};
};

export const handOffLivingTeam = async ({ pageId, toUserId = '', toPageId = '', toLabel = '' } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/team/handoff`,
    { requestId: requestId(), toUserId, toPageId, toLabel },
    getAuthHeaders()
  );
  return response.data || {};
};
