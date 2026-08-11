const crypto = require('crypto');
const { buildDecisionIndex } = require('./decisionIndexService');

const VERSION = 1;
const DEFAULT_LIMIT = 12;
const OUTCOME_RESULTS = new Set(['positive', 'negative', 'mixed']);
const clean = (value = '', limit = 4000) => String(value || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);
const id = value => String(value?._id || value?.id || value || '').trim();
const list = value => Array.isArray(value) ? value : [];
const sourceIdentity = value => {
  const ref = value?.ref || value || {};
  const rawType = clean(ref.type, 40).toLowerCase();
  const type = rawType === 'notebook' ? 'note' : rawType;
  const objectId = id(ref.id || ref.objectId);
  return type && objectId ? `${type}:${objectId}` : '';
};
const stableId = ({ pageId, decisionId }) => `decision_lesson_${crypto
  .createHash('sha256')
  .update(`v1|${pageId}|${decisionId}`)
  .digest('hex')
  .slice(0, 24)}`;

const buildDecisionLessonEvidence = async ({
  userId,
  targetPageId,
  models = {},
  asOf = new Date(),
  limit = DEFAULT_LIMIT,
  session = null,
  buildIndex = buildDecisionIndex
} = {}) => {
  if (!userId || !targetPageId || typeof buildIndex !== 'function') return [];
  const safeAsOf = asOf instanceof Date ? asOf : new Date(asOf);
  if (Number.isNaN(safeAsOf.getTime())) return [];
  const result = await buildIndex({
    userId,
    filter: 'reviewed',
    pageId: targetPageId,
    limit: 100,
    asOf: safeAsOf,
    models,
    session
  });
  const rows = list(result?.items).flatMap(item => {
    const reviewedAt = item?.outcome?.reviewedAt ? new Date(item.outcome.reviewedAt) : null;
    if (item?.continuity?.complete !== true
      || item?.decision?.origin !== 'user'
      || item?.decision?.status !== 'reviewed'
      || item?.outcome?.state !== 'observed'
      || !clean(item?.outcome?.lesson)
      || !clean(item?.outcome?.calibrationNote)
      || !item?.outcome?.receiptId
      || !OUTCOME_RESULTS.has(clean(item?.outcome?.result, 40).toLowerCase())
      || (item?.outcome?.processScore !== null
        && item?.outcome?.processScore !== undefined
        && (!Number.isFinite(Number(item.outcome.processScore))
          || Number(item.outcome.processScore) < 0
          || Number(item.outcome.processScore) > 1))
      || !list(item?.outcome?.evidence).length
      || list(item?.outcome?.missingEvidenceIds).length
      || !reviewedAt
      || Number.isNaN(reviewedAt.getTime())
      || reviewedAt > safeAsOf) return [];
    const samePage = id(item?.identity?.pageId) === id(targetPageId);
    if (!samePage) return [];
    const pageId = id(item?.identity?.pageId);
    const decisionId = clean(item?.identity?.decisionId, 160);
    return [{
      id: stableId({ pageId, decisionId }),
      kind: 'decision_lesson',
      status: 'available_for_review',
      acceptedIntoConcept: false,
      suggestedRole: null,
      lesson: clean(item.outcome.lesson, 4000),
      observedAt: item.outcome.observedAt,
      result: item.outcome.result,
      processScore: item.outcome.processScore,
      calibrationNote: clean(item.outcome.calibrationNote, 4000),
      decision: item.subject,
      page: item.page,
      observedEvidence: list(item.outcome.evidence),
      decisionSources: list(item?.links?.sources?.resolved),
      relatedClaims: list(item?.links?.claims?.resolved),
      relevanceBasis: { type: 'explicit_wiki_investigation', pageId },
      provenance: {
        acceptedRevisionId: item.continuity.acceptedRevisionId,
        recordedRevisionId: item.continuity.recordedRevisionId,
        outcomeRevisionId: item.continuity.outcomeRevisionId,
        decisionReceiptId: item.continuity.decisionReceiptId,
        outcomeReceiptId: item.outcome.receiptId,
        immutableSnapshotHash: item.continuity.immutableSnapshotHash,
        outcomeRecordHash: item.continuity.outcomeRecordHash
      },
      _rank: [-reviewedAt.getTime(), -(new Date(item.outcome.observedAt || 0).getTime() || 0), decisionId]
    }];
  });
  rows.sort((left, right) => {
    for (let index = 0; index < left._rank.length; index += 1) {
      if (left._rank[index] < right._rank[index]) return -1;
      if (left._rank[index] > right._rank[index]) return 1;
    }
    return 0;
  });
  return rows.slice(0, Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 50)))
    .map(({ _rank, ...row }) => row);
};

module.exports = {
  DEFAULT_LIMIT,
  VERSION,
  buildDecisionLessonEvidence,
  sourceIdentity,
  stableId
};
