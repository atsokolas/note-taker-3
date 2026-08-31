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

export const getCaseLineage = async ({ pageId } = {}) => {
  const response = await api.get(`/api/judgment/pages/${safe(pageId)}/lineage`, getAuthHeaders());
  return response.data?.thread || response.data || null;
};

export const proposeCaseLineage = async ({
  pageId, toPageId, kind, object, direction = 'shares', contradiction = false
} = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/lineage`,
    { requestId: requestId(), toPageId, kind, object, direction, contradiction },
    getAuthHeaders()
  );
  return response.data || {};
};

export const rejectCaseLineage = async ({ pageId, linkId } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/lineage/${safe(linkId)}/reject`,
    { requestId: requestId() },
    getAuthHeaders()
  );
  return response.data || {};
};

export const acceptCaseLineage = async ({ pageId, linkId } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/lineage/${safe(linkId)}/accept`,
    { requestId: requestId() },
    getAuthHeaders()
  );
  return response.data || {};
};

export const getCaseStress = async ({ pageId } = {}) => {
  const response = await api.get(`/api/judgment/pages/${safe(pageId)}/stress`, getAuthHeaders());
  return response.data?.overlay || response.data || null;
};

export const draftCaseStress = async ({
  pageId, kind, modifiedAssumptions, proposedPosture = '', uncertainty = ''
} = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/stress`,
    { requestId: requestId(), kind, modifiedAssumptions, proposedPosture, uncertainty, generated: true },
    getAuthHeaders()
  );
  return response.data || {};
};

export const chooseCaseStress = async ({ pageId, scenarioId, choice } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/stress/${safe(scenarioId)}/choose`,
    { requestId: requestId(), choice },
    getAuthHeaders()
  );
  return response.data || {};
};

export const getCaseWatch = async ({ pageId } = {}) => {
  const response = await api.get(`/api/judgment/pages/${safe(pageId)}/watch`, getAuthHeaders());
  return response.data || {};
};

export const openCaseWatch = async ({ pageId, purpose, budget = 3 } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/watch`,
    { requestId: requestId(), purpose, budget },
    getAuthHeaders()
  );
  return response.data || {};
};

export const acceptWatchProposal = async ({ pageId, proposalId } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/watch/${safe(proposalId)}/accept`,
    { requestId: requestId() },
    getAuthHeaders()
  );
  return response.data || {};
};

export const reverseWatchProposal = async ({ pageId, proposalId } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/watch/${safe(proposalId)}/reverse`,
    { requestId: requestId() },
    getAuthHeaders()
  );
  return response.data || {};
};

export const killCaseWatch = async ({ pageId } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/watch/kill`,
    { requestId: requestId() },
    getAuthHeaders()
  );
  return response.data || {};
};

export const exportDecisionMemory = async () => {
  const response = await api.get('/api/decision-memory/v1/export', getAuthHeaders());
  return response.data?.bundle || response.data || null;
};

export const importDecisionMemory = async (bundle) => {
  const response = await api.post(
    '/api/decision-memory/v1/import',
    { bundle, requestId: requestId() },
    getAuthHeaders()
  );
  return response.data || {};
};

export const holdDecisionCase = async ({ pageId, kind = 'retention', note = '' } = {}) => {
  const response = await api.post(
    `/api/judgment/pages/${safe(pageId)}/hold`,
    { requestId: requestId(), kind, note },
    getAuthHeaders()
  );
  return response.data || {};
};


