const crypto = require('crypto');

const VALUES = Object.freeze({
  kind: ['thesis', 'decision', 'prediction'],
  status: ['framing', 'researching', 'challenged', 'decision_ready', 'monitoring', 'closed', 'archived'],
  decisionPosture: ['investigate', 'watch', 'act', 'avoid', 'no_action', 'closed'],
  assumptionStatus: ['unreviewed', 'holds', 'weakened', 'failed'],
  unknownPriority: ['critical', 'high', 'medium', 'low'],
  unknownStatus: ['open', 'researching', 'answered', 'deferred'],
  falsifierStatus: ['unobserved', 'warning', 'triggered', 'retired'],
  decisionType: ['research', 'outreach', 'product', 'operating', 'investment', 'no_action', 'close'],
  decisionStatus: ['planned', 'taken', 'cancelled', 'reviewed'],
  decisionCreator: ['user', 'ai_proposed'],
  outcomeResult: ['positive', 'negative', 'mixed', 'unknown'],
  epistemicStatus: ['established_fact', 'supported_interpretation', 'plausible_hypothesis', 'speculation', 'rejected'],
  materiality: ['critical', 'major', 'supporting', 'context']
});

class JudgmentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JudgmentValidationError';
    this.statusCode = 400;
  }
}

const plain = value => (value?.toObject ? value.toObject() : value || {});
const clean = (value, limit = 4000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit).trim() : text;
};
const cleanList = (value, limit = 100) => (
  Array.isArray(value) ? value.map(item => clean(item, 200)).filter(Boolean).slice(0, limit) : []
);
const enumValue = (field, value, allowed, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = clean(value).toLowerCase();
  if (!allowed.includes(normalized)) throw new JudgmentValidationError(`${field} must be one of: ${allowed.join(', ')}.`);
  return normalized;
};
const confidenceValue = (field, value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new JudgmentValidationError(`${field} must be between 0 and 1.`);
  }
  return normalized;
};
const dateValue = (field, value, fallback = null) => {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new JudgmentValidationError(`${field} must be a valid date.`);
  return date;
};
const stableId = (prefix, value) => clean(value, 120) || `${prefix}_${crypto.randomUUID()}`;
const normalizeRefs = value => (Array.isArray(value) ? value.map(item => clean(item, 120)).filter(Boolean).slice(0, 100) : []);

const normalizeAssumptions = (items = []) => {
  if (!Array.isArray(items)) throw new JudgmentValidationError('judgment.assumptions must be an array.');
  return items.slice(0, 100).map((raw) => {
    const item = plain(raw);
    const text = clean(item.text, 2000);
    if (!text) throw new JudgmentValidationError('Each assumption requires text.');
    return {
      assumptionId: stableId('assumption', item.assumptionId),
      text,
      status: enumValue('assumption.status', item.status, VALUES.assumptionStatus, 'unreviewed'),
      confidence: confidenceValue('assumption.confidence', item.confidence, null),
      affectedClaimIds: normalizeRefs(item.affectedClaimIds),
      sourceRefIds: normalizeRefs(item.sourceRefIds),
      lastReviewedAt: dateValue('assumption.lastReviewedAt', item.lastReviewedAt, null),
      createdAt: dateValue('assumption.createdAt', item.createdAt, new Date())
    };
  });
};

const normalizeUnknowns = (items = []) => {
  if (!Array.isArray(items)) throw new JudgmentValidationError('judgment.unknowns must be an array.');
  return items.slice(0, 100).map((raw) => {
    const item = plain(raw);
    const question = clean(item.question, 2000);
    if (!question) throw new JudgmentValidationError('Each unknown requires a question.');
    return {
      unknownId: stableId('unknown', item.unknownId),
      question,
      priority: enumValue('unknown.priority', item.priority, VALUES.unknownPriority, 'medium'),
      status: enumValue('unknown.status', item.status, VALUES.unknownStatus, 'open'),
      answer: clean(item.answer, 4000),
      affectedClaimIds: normalizeRefs(item.affectedClaimIds),
      sourceRefIds: normalizeRefs(item.sourceRefIds),
      ownerLabel: clean(item.ownerLabel, 200),
      dueAt: dateValue('unknown.dueAt', item.dueAt, null),
      resolvedAt: dateValue('unknown.resolvedAt', item.resolvedAt, null),
      createdAt: dateValue('unknown.createdAt', item.createdAt, new Date())
    };
  });
};

const normalizeFalsifiers = (items = []) => {
  if (!Array.isArray(items)) throw new JudgmentValidationError('judgment.falsifiers must be an array.');
  return items.slice(0, 100).map((raw) => {
    const item = plain(raw);
    const text = clean(item.text, 2000);
    if (!text) throw new JudgmentValidationError('Each falsifier requires text.');
    return {
      falsifierId: stableId('falsifier', item.falsifierId),
      text,
      observableSignal: clean(item.observableSignal, 2000),
      status: enumValue('falsifier.status', item.status, VALUES.falsifierStatus, 'unobserved'),
      affectedClaimIds: normalizeRefs(item.affectedClaimIds),
      sourceRefIds: normalizeRefs(item.sourceRefIds),
      lastCheckedAt: dateValue('falsifier.lastCheckedAt', item.lastCheckedAt, null),
      triggeredAt: dateValue('falsifier.triggeredAt', item.triggeredAt, null),
      createdAt: dateValue('falsifier.createdAt', item.createdAt, new Date())
    };
  });
};

const normalizeDecisions = (items = [], actorType = 'user', priorItems = []) => {
  if (!Array.isArray(items)) throw new JudgmentValidationError('judgment.decisions must be an array.');
  const priorById = new Map((Array.isArray(priorItems) ? priorItems : []).map(raw => {
    const item = plain(raw);
    return [clean(item.decisionId, 120), item];
  }).filter(([id]) => id));
  return items.slice(0, 100).map((raw) => {
    const item = plain(raw);
    const summary = clean(item.summary, 2000);
    if (!summary) throw new JudgmentValidationError('Each decision requires a summary.');
    const prior = priorById.get(clean(item.decisionId, 120)) || null;
    const requestedCreator = enumValue('decision.createdBy', item.createdBy, VALUES.decisionCreator, prior?.createdBy || 'user');
    const createdBy = prior?.createdBy || (actorType === 'agent' ? 'ai_proposed' : requestedCreator);
    const status = enumValue('decision.status', item.status, VALUES.decisionStatus, 'planned');
    if ((createdBy === 'ai_proposed' || actorType === 'agent') && status === 'taken' && prior?.status !== 'taken') {
      throw new JudgmentValidationError('AI-proposed decisions require a human action before they can be marked taken.');
    }
    const outcome = plain(item.outcome);
    return {
      decisionId: stableId('decision', item.decisionId),
      decidedAt: dateValue('decision.decidedAt', item.decidedAt, null),
      decisionType: enumValue('decision.decisionType', item.decisionType, VALUES.decisionType, 'research'),
      summary,
      rationale: clean(item.rationale, 4000),
      expectedOutcome: clean(item.expectedOutcome, 4000),
      horizon: clean(item.horizon, 500),
      successCriteria: cleanList(item.successCriteria, 30),
      reviewAt: dateValue('decision.reviewAt', item.reviewAt, null),
      status,
      relatedClaimIds: normalizeRefs(item.relatedClaimIds),
      sourceRefIds: normalizeRefs(item.sourceRefIds),
      outcome: {
        observedAt: dateValue('decision.outcome.observedAt', outcome.observedAt, null),
        summary: clean(outcome.summary, 4000),
        result: enumValue('decision.outcome.result', outcome.result, VALUES.outcomeResult, 'unknown'),
        processScore: confidenceValue('decision.outcome.processScore', outcome.processScore, null),
        calibrationNote: clean(outcome.calibrationNote, 4000),
        lesson: clean(outcome.lesson, 4000)
      },
      createdAt: dateValue('decision.createdAt', item.createdAt, new Date()),
      createdBy
    };
  });
};

const normalizeJudgment = ({ input, existing = null, actorType = 'user' } = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new JudgmentValidationError('judgment must be an object.');
  }
  const prior = plain(existing);
  const next = { ...prior, ...input };
  const kind = enumValue('judgment.kind', next.kind, VALUES.kind, prior.kind || null);
  const governingQuestion = clean(next.governingQuestion, 2000);
  if (kind && !governingQuestion) throw new JudgmentValidationError('A governing question is required for judgment pages.');
  const status = enumValue('judgment.status', next.status, VALUES.status, 'framing');
  const currentJudgment = clean(next.currentJudgment, 8000);
  if (['decision_ready', 'monitoring', 'closed'].includes(status) && !currentJudgment) {
    throw new JudgmentValidationError(`${status} requires a current judgment.`);
  }
  const causal = plain(next.causalModel);
  return {
    kind,
    governingQuestion,
    currentJudgment,
    confidence: confidenceValue('judgment.confidence', next.confidence, null),
    status,
    decisionPosture: enumValue('judgment.decisionPosture', next.decisionPosture, VALUES.decisionPosture, 'investigate'),
    ownerLabel: clean(next.ownerLabel, 200),
    startedAt: dateValue('judgment.startedAt', next.startedAt, null),
    lastReviewedAt: dateValue('judgment.lastReviewedAt', next.lastReviewedAt, null),
    nextReviewAt: dateValue('judgment.nextReviewAt', next.nextReviewAt, null),
    nextReviewTrigger: clean(next.nextReviewTrigger, 2000),
    initialRevisionId: prior.initialRevisionId || null,
    strongestCounterargument: clean(next.strongestCounterargument, 8000),
    causalModel: { summary: clean(causal.summary, 8000), nodes: [], edges: [] },
    assumptions: normalizeAssumptions(next.assumptions || []),
    unknowns: normalizeUnknowns(next.unknowns || []),
    falsifiers: normalizeFalsifiers(next.falsifiers || []),
    decisions: normalizeDecisions(next.decisions || [], actorType, prior.decisions || [])
  };
};

const normalizeClaimUpdates = (updates = []) => {
  if (!Array.isArray(updates)) throw new JudgmentValidationError('claimUpdates must be an array.');
  return updates.slice(0, 200).map((raw) => {
    const item = plain(raw);
    const claimId = clean(item.claimId, 200);
    if (!claimId) throw new JudgmentValidationError('Each claim update requires claimId.');
    return {
      claimId,
      epistemicStatus: enumValue('claim.epistemicStatus', item.epistemicStatus, VALUES.epistemicStatus, 'plausible_hypothesis'),
      materiality: enumValue('claim.materiality', item.materiality, VALUES.materiality, 'supporting'),
      implication: clean(item.implication, 4000),
      falsifierIds: normalizeRefs(item.falsifierIds)
    };
  });
};

module.exports = {
  JudgmentValidationError,
  VALUES,
  normalizeClaimUpdates,
  normalizeJudgment
};
