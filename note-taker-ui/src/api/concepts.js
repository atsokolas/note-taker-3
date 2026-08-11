import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearCached, fetchWithCache } from '../utils/cache';

/**
 * @typedef {Object} Concept
 * @property {string} name
 * @property {string} description
 * @property {number} [count]
 * @property {Array} [pinnedHighlightIds]
 * @property {Array} [pinnedArticleIds]
 * @property {Array} [pinnedNoteIds]
 * @property {Array<{ tag: string, count: number }>} [relatedTags]
 * @property {Array<{ _id: string, title: string, url?: string, createdAt?: string }>} [pinnedArticles]
 */

const CONCEPTS_CACHE_KEY = 'concepts.list';
const CONCEPTS_CACHE_TTL_MS = 30_000;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export const clearConceptsCache = () => clearCached(CONCEPTS_CACHE_KEY);

export const getConcepts = async ({ force = false } = {}) => fetchWithCache(
  CONCEPTS_CACHE_KEY,
  async () => {
    const res = await api.get('/api/concepts', getAuthHeaders());
    return res.data || [];
  },
  { force, ttlMs: CONCEPTS_CACHE_TTL_MS }
);

export const getConcept = async (name) => {
  const res = await api.get(`/api/concepts/${encodeURIComponent(name)}`, getAuthHeaders());
  return res.data;
};

export const getConceptInvestigation = async ({
  conceptId,
  wikiPageId,
  revisionId = '',
  claimId = ''
}) => {
  const rawConceptId = String(conceptId || '').trim();
  const safeWikiPageId = String(wikiPageId || '').trim();
  const safeRevisionId = String(revisionId || '').trim();
  if (!OBJECT_ID_PATTERN.test(rawConceptId)) {
    throw new Error('Concept id must be a valid object id.');
  }
  if (!OBJECT_ID_PATTERN.test(safeWikiPageId)) {
    throw new Error('Wiki page id must be a valid object id.');
  }
  if (safeRevisionId && !OBJECT_ID_PATTERN.test(safeRevisionId)) {
    throw new Error('Revision id must be a valid object id.');
  }
  const safeConceptId = encodeURIComponent(rawConceptId);
  const params = new URLSearchParams({ wikiPageId: safeWikiPageId });
  const claimProvided = claimId !== undefined && claimId !== null && claimId !== '';
  if (claimProvided && typeof claimId !== 'string') {
    throw new Error('Claim id must be a string.');
  }
  const safeClaimId = String(claimId || '').trim();
  if (claimProvided && (!safeClaimId || safeClaimId.length > 240)) {
    throw new Error('Claim id must contain 1 to 240 characters.');
  }
  if (safeRevisionId) params.set('revisionId', safeRevisionId);
  if (safeClaimId) params.set('claimId', safeClaimId);
  const res = await api.get(
    `/api/concepts/${safeConceptId}/investigation?${params.toString()}`,
    getAuthHeaders()
  );
  if (
    !res.data
    || !res.data.investigation
    || typeof res.data.investigation !== 'object'
    || typeof res.data.generatedAt !== 'string'
    || !res.data.generatedAt.trim()
  ) {
    throw new Error('Concept investigation response is malformed.');
  }
  return res.data;
};

/**
 * Explicit human-only adoption of a retained decision lesson into a destination Concept.
 * Submits identities and expected hashes only — never lesson text or provenance bodies.
 */
export const adoptDecisionLessonEvidence = async (conceptId, {
  sourcePageId,
  decisionId,
  lessonId,
  role,
  requestId,
  expectedDecisionHash,
  expectedOutcomeHash
} = {}) => {
  const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const opaque = (value, label, max) => {
    if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
    const safe = value.trim();
    if (!safe || safe.length > max) throw new Error(`${label} must contain 1 to ${max} characters.`);
    return safe;
  };
  const objectId = (value, label) => {
    const safe = opaque(value, label, 24);
    if (!OBJECT_ID_PATTERN.test(safe)) throw new Error(`${label} must be a valid object id.`);
    return safe.toLowerCase();
  };
  const safeConceptId = objectId(conceptId, 'Concept id');
  const safeSourcePageId = objectId(sourcePageId, 'Source page id');
  const safeDecisionId = opaque(decisionId, 'Decision id', 180);
  const safeLessonId = opaque(lessonId, 'Lesson id', 180);
  const safeRequestId = opaque(requestId, 'Request id', 180);
  const safeDecisionHash = opaque(expectedDecisionHash, 'Expected decision hash', 128);
  const safeOutcomeHash = opaque(expectedOutcomeHash, 'Expected outcome hash', 128);
  if (typeof role !== 'string') throw new Error('Evidence role must be a string.');
  const safeRole = role.trim().toLowerCase();
  if (!['support', 'tension', 'context'].includes(safeRole)) {
    throw new Error('Evidence role must be support, tension, or context.');
  }
  const body = {
    sourcePageId: safeSourcePageId,
    decisionId: safeDecisionId,
    lessonId: safeLessonId,
    role: safeRole,
    requestId: safeRequestId,
    expectedDecisionHash: safeDecisionHash,
    expectedOutcomeHash: safeOutcomeHash
  };
  const res = await api.post(
    `/api/concepts/${safeConceptId}/evidence/decision-lessons`,
    body,
    getAuthHeaders()
  );
  const data = res?.data;
  const adoption = data?.adoption;
  const adoptionProvenance = adoption?.provenance;
  const receipt = data?.receipt;
  const receiptProvenance = receipt?.provenance;
  const receiptClock = typeof receipt?.completedAt === 'string'
    ? new Date(receipt.completedAt)
    : null;
  if (!plain(data)
    || typeof data.idempotent !== 'boolean'
    || !plain(adoption)
    || !opaque(adoption.id, 'Adoption id', 180)
    || adoption.kind !== 'decision_lesson'
    || adoption.status !== 'accepted'
    || adoption.acceptedIntoConcept !== true
    || adoption.role !== safeRole
    || String(adoption.targetConceptId || '').toLowerCase() !== safeConceptId
    || String(adoption.sourcePageId || '').toLowerCase() !== safeSourcePageId
    || adoption.decisionId !== safeDecisionId
    || adoption.lessonId !== safeLessonId
    || !plain(adoptionProvenance)
    || !opaque(adoptionProvenance.adoptionReceiptId, 'Adoption receipt id', 300)
    || adoptionProvenance.decisionSnapshotHash !== safeDecisionHash
    || adoptionProvenance.outcomeRecordHash !== safeOutcomeHash
    || !plain(receipt)
    || receipt.id !== adoptionProvenance.adoptionReceiptId
    || receipt.kind !== 'concept_decision_lesson_adopted'
    || receipt.source !== 'concept'
    || receipt.status !== 'completed'
    || !receiptClock
    || Number.isNaN(receiptClock.getTime())
    || !plain(receiptProvenance)
    || receiptProvenance.version !== 1
    || receiptProvenance.action !== 'adopt_decision_lesson'
    || receiptProvenance.actorType !== 'user'
    || receiptProvenance.requestId !== safeRequestId
    || receiptProvenance.adoptionId !== adoption.id
    || String(receiptProvenance.targetConceptId || '').toLowerCase() !== safeConceptId
    || String(receiptProvenance.sourcePageId || '').toLowerCase() !== safeSourcePageId
    || receiptProvenance.decisionId !== safeDecisionId
    || receiptProvenance.lessonId !== safeLessonId
    || receiptProvenance.role !== safeRole
    || receiptProvenance.decisionSnapshotHash !== safeDecisionHash
    || receiptProvenance.outcomeRecordHash !== safeOutcomeHash) {
    throw new Error('Decision lesson adoption response is malformed or mismatched.');
  }
  return data;
};

export const updateConcept = async (name, payload) => {
  const res = await api.put(`/api/concepts/${encodeURIComponent(name)}`, payload, getAuthHeaders());
  clearConceptsCache();
  return res.data;
};

export const updateConceptPins = async (name, payload) => {
  const res = await api.put(`/api/concepts/${encodeURIComponent(name)}/pins`, payload, getAuthHeaders());
  clearConceptsCache();
  return res.data;
};

export const getConceptRelated = async (name, { limit = 20, offset = 0 } = {}) => {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const res = await api.get(`/api/concepts/${encodeURIComponent(name)}/related?${params.toString()}`, getAuthHeaders());
  return res.data;
};

export const getConceptLayout = async (conceptIdOrName) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.get(`/api/concepts/${safe}/layout`, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', layout: null };
};

export const updateConceptLayout = async (conceptIdOrName, layout) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.put(`/api/concepts/${safe}/layout`, { layout }, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', layout: null };
};

export const addConceptLayoutCard = async (conceptIdOrName, payload = {}) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.post(`/api/concepts/${safe}/layout/add-card`, payload, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', layout: null, card: null };
};

export const getConceptWorkspace = async (conceptIdOrName) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.get(`/api/concepts/${safe}/workspace`, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', workspace: null };
};

export const replaceConceptWorkspace = async (conceptIdOrName, workspace) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.put(`/api/concepts/${safe}/workspace`, { workspace }, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', workspace: null };
};

export const patchConceptWorkspace = async (conceptIdOrName, op, payload = {}) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.patch(`/api/concepts/${safe}/workspace`, { op, payload }, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', workspace: null };
};

export const createConceptWorkspaceSection = async (conceptIdOrName, payload = {}) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.post(`/api/concepts/${safe}/workspace/sections`, payload, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', section: null, workspace: null };
};

export const updateConceptWorkspaceSection = async (conceptIdOrName, sectionId, payload = {}) => {
  const safeConcept = encodeURIComponent(String(conceptIdOrName || '').trim());
  const safeSection = encodeURIComponent(String(sectionId || '').trim());
  const res = await api.patch(`/api/concepts/${safeConcept}/workspace/sections/${safeSection}`, payload, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', section: null, workspace: null };
};

export const attachConceptWorkspaceBlock = async (conceptIdOrName, payload = {}) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.post(`/api/concepts/${safe}/workspace/blocks/attach`, payload, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', block: null, workspace: null };
};

export const updateConceptWorkspaceBlock = async (conceptIdOrName, blockId, payload = {}) => {
  const safeConcept = encodeURIComponent(String(conceptIdOrName || '').trim());
  const safeBlock = encodeURIComponent(String(blockId || '').trim());
  const res = await api.patch(`/api/concepts/${safeConcept}/workspace/blocks/${safeBlock}`, payload, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', block: null, workspace: null };
};

export const buildConceptWorkspaceFromLibrary = async (conceptIdOrName, payload = {}) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const body = {
    mode: 'library_only',
    maxLoops: 2,
    ...(payload && typeof payload === 'object' ? payload : {})
  };
  const res = await api.post(`/api/concepts/${safe}/agent/build`, body, getAuthHeaders());
  return res.data || { ok: false, summary: null, conceptId: '' };
};

export const suggestConceptWorkspaceFromLibrary = async (conceptIdOrName, payload = {}) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const body = {
    mode: 'library_only',
    maxLoops: 2,
    ...(payload && typeof payload === 'object' ? payload : {})
  };
  const res = await api.post(`/api/concepts/${safe}/agent/suggest`, body, getAuthHeaders());
  return res.data || { ok: false, conceptId: '', draftId: '', summary: { itemSuggestions: 0, conceptSuggestions: 0 } };
};

export const getConceptAgentSuggestions = async (conceptIdOrName) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.get(`/api/concepts/${safe}/agent/suggestions`, getAuthHeaders());
  return res.data || { ok: true, conceptId: '', drafts: [] };
};

export const acceptConceptAgentSuggestions = async (conceptIdOrName, draftId, payload = {}) => {
  const safeConcept = encodeURIComponent(String(conceptIdOrName || '').trim());
  const safeDraft = encodeURIComponent(String(draftId || '').trim());
  const body = payload && typeof payload === 'object' ? payload : {};
  const res = await api.post(`/api/concepts/${safeConcept}/agent/suggestions/${safeDraft}/accept`, body, getAuthHeaders());
  clearConceptsCache();
  return res.data || { ok: false, conceptId: '', draftId: '', updatedCount: 0, workspaceSummary: null };
};

export const discardConceptAgentSuggestions = async (conceptIdOrName, draftId, payload = {}) => {
  const safeConcept = encodeURIComponent(String(conceptIdOrName || '').trim());
  const safeDraft = encodeURIComponent(String(draftId || '').trim());
  const body = payload && typeof payload === 'object' ? payload : {};
  const res = await api.post(`/api/concepts/${safeConcept}/agent/suggestions/${safeDraft}/discard`, body, getAuthHeaders());
  return res.data || { ok: false, conceptId: '', draftId: '', updatedCount: 0 };
};

export const getConceptMaterial = async (conceptIdOrName) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.get(`/api/concepts/${safe}/material`, getAuthHeaders());
  return res.data || { pinnedHighlights: [], recentHighlights: [], linkedArticles: [], linkedNotes: [] };
};

export const getConceptIdeaWorkbench = async (conceptIdOrName) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.get(`/api/concepts/${safe}/idea-workbench`, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', ideaWorkbench: null, ideaWorkbenchMeta: null, revision: 0, events: [] };
};

export const updateConceptIdeaWorkbench = async (conceptIdOrName, ideaWorkbench, options = {}) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const body = {
    ideaWorkbench,
    ...(options && typeof options === 'object' ? options : {})
  };
  const res = await api.put(`/api/concepts/${safe}/idea-workbench`, body, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', ideaWorkbench: null, ideaWorkbenchMeta: null, revision: 0, events: [] };
};

export const applyConceptIdeaWorkbenchChangeDraft = async (conceptIdOrName, draftId) => {
  const safeConcept = encodeURIComponent(String(conceptIdOrName || '').trim());
  const safeDraft = encodeURIComponent(String(draftId || '').trim());
  const res = await api.post(`/api/concepts/${safeConcept}/idea-workbench/change-drafts/${safeDraft}/apply`, {}, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', ideaWorkbench: null, ideaWorkbenchMeta: null, revision: 0, events: [] };
};

export const dismissConceptIdeaWorkbenchChangeDraft = async (conceptIdOrName, draftId) => {
  const safeConcept = encodeURIComponent(String(conceptIdOrName || '').trim());
  const safeDraft = encodeURIComponent(String(draftId || '').trim());
  const res = await api.post(`/api/concepts/${safeConcept}/idea-workbench/change-drafts/${safeDraft}/dismiss`, {}, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', ideaWorkbench: null, ideaWorkbenchMeta: null, revision: 0, events: [] };
};

export const acceptConceptIdeaWorkbenchComment = async (conceptIdOrName, commentId) => {
  const safeConcept = encodeURIComponent(String(conceptIdOrName || '').trim());
  const safeComment = encodeURIComponent(String(commentId || '').trim());
  const res = await api.post(`/api/concepts/${safeConcept}/idea-workbench/comments/${safeComment}/accept`, {}, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', ideaWorkbench: null, ideaWorkbenchMeta: null, revision: 0, events: [] };
};

export const dismissConceptIdeaWorkbenchComment = async (conceptIdOrName, commentId) => {
  const safeConcept = encodeURIComponent(String(conceptIdOrName || '').trim());
  const safeComment = encodeURIComponent(String(commentId || '').trim());
  const res = await api.post(`/api/concepts/${safeConcept}/idea-workbench/comments/${safeComment}/dismiss`, {}, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', ideaWorkbench: null, ideaWorkbenchMeta: null, revision: 0, events: [] };
};

export const markConceptIdeaWorkbenchReviewed = async (conceptIdOrName) => {
  const safeConcept = encodeURIComponent(String(conceptIdOrName || '').trim());
  const res = await api.post(`/api/concepts/${safeConcept}/idea-workbench/mark-reviewed`, {}, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', ideaWorkbench: null, ideaWorkbenchMeta: null, revision: 0, events: [] };
};

export const appendConceptIdeaWorkbenchEvents = async (conceptIdOrName, events) => {
  const safe = encodeURIComponent(String(conceptIdOrName || '').trim());
  const payload = Array.isArray(events) ? { events } : { event: events };
  const res = await api.post(`/api/concepts/${safe}/idea-workbench/events`, payload, getAuthHeaders());
  return res.data || { conceptId: '', conceptName: '', events: [] };
};

// Public concept share -------------------------------------------------------

export const getConceptShare = async (name) => {
  const res = await api.get(`/api/concepts/${encodeURIComponent(name)}/share`, getAuthHeaders());
  return res.data || { shared: false };
};

export const mintConceptShare = async (name) => {
  const res = await api.post(`/api/concepts/${encodeURIComponent(name)}/share`, {}, getAuthHeaders());
  return res.data || {};
};

export const revokeConceptShare = async (name) => {
  const res = await api.delete(`/api/concepts/${encodeURIComponent(name)}/share`, getAuthHeaders());
  return res.data || { revoked: true };
};

// Public read — no auth headers; readable while unauthenticated.
export const getPublicConcept = async (slug) => {
  const res = await api.get(`/api/public/concepts/${encodeURIComponent(slug)}`);
  return res.data;
};
