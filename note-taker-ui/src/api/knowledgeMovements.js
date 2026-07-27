import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const requireObjectId = (value, label) => {
  const safe = String(value || '').trim();
  if (!OBJECT_ID_PATTERN.test(safe)) throw new Error(`${label} must be a valid object id.`);
  return safe;
};

const optionalClaimId = value => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error('Claim id must be a string.');
  const safe = value.trim();
  if (!safe || safe.length > 240) throw new Error('Claim id must contain 1 to 240 characters.');
  return safe;
};

const queryStringFor = ({ since = '', limit = 3 } = {}) => {
  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    throw new Error('Movement limit must be an integer from 1 to 50.');
  }
  const query = new URLSearchParams();
  const safeSince = String(since || '').trim();
  if (safeSince && !ISO_UTC_PATTERN.test(safeSince)) {
    throw new Error('Movement since must be an ISO-8601 UTC timestamp.');
  }
  if (safeSince) query.set('since', safeSince);
  query.set('limit', String(parsedLimit));
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
};

export const getKnowledgeMovements = async (params = {}) => {
  const response = await api.get(
    `/api/knowledge/movements${queryStringFor(params)}`,
    getAuthHeaders()
  );
  if (
    !response.data
    || !Array.isArray(response.data.movements)
    || typeof response.data.generatedAt !== 'string'
    || !response.data.generatedAt.trim()
  ) {
    throw new Error('Knowledge movements response is malformed.');
  }
  return response.data;
};

export const startKnowledgeMovementInvestigation = async ({
  wikiPageId,
  revisionId,
  claimId = ''
} = {}) => {
  const safeWikiPageId = requireObjectId(wikiPageId, 'Wiki page id');
  const safeRevisionId = requireObjectId(revisionId, 'Revision id');
  const safeClaimId = optionalClaimId(claimId);

  const body = { revisionId: safeRevisionId };
  if (safeClaimId) body.claimId = safeClaimId;
  const response = await api.post(
    `/api/wiki/pages/${encodeURIComponent(safeWikiPageId)}/investigation`,
    body,
    getAuthHeaders()
  );
  if (
    !response.data
    || !OBJECT_ID_PATTERN.test(String(response.data.concept?.id || '').trim())
    || typeof response.data.concept?.href !== 'string'
    || !response.data.concept.href.trim()
  ) {
    throw new Error('Investigation start response is malformed.');
  }
  return response.data;
};

export default getKnowledgeMovements;
