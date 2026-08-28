const crypto = require('crypto');

const VALUES = Object.freeze({
  kind: ['thesis', 'decision', 'prediction'],
  status: ['framing', 'researching', 'challenged', 'decision_ready', 'monitoring', 'parked', 'closed', 'archived'],
  lessonClosedAs: ['parked', 'closed', 'retired', 'revised', ''],
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

/* "Why" and "Against" are the two reason lists the human reads on the Judgment
   page. A line an agent proposed and the human accepted keeps `acceptedFrom`
   so the page can say where it came from without inventing a new record type. */
const normalizeReasons = (field, items = []) => {
  if (!Array.isArray(items)) throw new JudgmentValidationError(`judgment.${field} must be an array.`);
  return items.slice(0, 100).map((raw) => {
    const item = plain(raw);
    const text = clean(item.text, 2000);
    if (!text) throw new JudgmentValidationError(`Each ${field} line requires text.`);
    return {
      reasonId: stableId(field, item.reasonId),
      text,
      sourceRefIds: normalizeRefs(item.sourceRefIds),
      sourceLabel: clean(item.sourceLabel, 200),
      acceptedFrom: clean(item.acceptedFrom, 200),
      createdAt: dateValue(`${field}.createdAt`, item.createdAt || item.at, new Date())
    };
  });
};

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

/* Lessons are a ledger, like decisions. What was written stays written: a
   lesson can be added and it can never be edited away, because a lesson you
   later found embarrassing is exactly the one worth keeping. Anything the
   caller sends that matches a lesson already stored is ignored in favour of
   the stored one. */
/* Edges between beliefs. An agent may propose one and may never store one as
   accepted: the reader decides what rests on what. Self-reference is dropped
   rather than refused, because it is a mistake and not an attack. */
const normalizeDependencies = (items = [], actorType = 'user', selfId = '') => {
  if (!Array.isArray(items)) throw new JudgmentValidationError('judgment.dependsOn must be an array.');
  const seen = new Set();
  const out = [];
  items.slice(0, 100).forEach((raw) => {
    const item = plain(raw);
    const pageId = clean(item.pageId, 120);
    if (!pageId) throw new JudgmentValidationError('Each dependency requires a pageId.');
    if (selfId && pageId === clean(selfId, 120)) return;
    if (seen.has(pageId)) return;
    seen.add(pageId);
    const proposedBy = enumValue('dependency.proposedBy', item.proposedBy, VALUES.decisionCreator, 'user');
    if (actorType === 'agent' && proposedBy !== 'ai_proposed') {
      throw new JudgmentValidationError('An agent may only propose a dependency, never accept one.');
    }
    out.push({
      dependencyId: stableId('dependency', item.dependencyId),
      pageId,
      note: clean(item.note, 2000),
      proposedBy: actorType === 'agent' ? 'ai_proposed' : proposedBy,
      acceptedAt: dateValue('dependency.acceptedAt', item.acceptedAt, null) || new Date()
    });
  });
  return out;
};

const normalizeLessons = (items = [], priorItems = []) => {
  if (!Array.isArray(items)) throw new JudgmentValidationError('judgment.lessons must be an array.');
  const prior = (Array.isArray(priorItems) ? priorItems : []).map(plain);
  const priorById = new Map(prior.map(item => [clean(item.lessonId, 120), item]).filter(([id]) => id));
  const kept = [...prior];
  const keptIds = new Set(priorById.keys());

  items.slice(0, 200).forEach((raw) => {
    const item = plain(raw);
    const id = clean(item.lessonId, 120);
    if (id && keptIds.has(id)) return;
    const text = clean(item.text, 2000);
    if (!text) throw new JudgmentValidationError('Each lesson requires text.');
    const lesson = {
      lessonId: stableId('lesson', item.lessonId),
      text,
      closedAs: enumValue('lesson.closedAs', item.closedAs, VALUES.lessonClosedAs, ''),
      at: dateValue('lesson.at', item.at, null) || new Date()
    };
    keptIds.add(lesson.lessonId);
    kept.push(lesson);
  });

  return kept;
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

const normalizeJudgment = ({ input, existing = null, actorType = 'user', pageId = '' } = {}) => {
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
    why: normalizeReasons('why', next.why || []),
    against: normalizeReasons('against', next.against || []),
    assumptions: normalizeAssumptions(next.assumptions || []),
    unknowns: normalizeUnknowns(next.unknowns || []),
    falsifiers: normalizeFalsifiers(next.falsifiers || []),
    decisions: normalizeDecisions(next.decisions || [], actorType, prior.decisions || []),
    /* Parking is reversible, so the date comes off again when the reader picks
       the judgment back up. It is not a record of having once parked it. */
    parkedAt: status === 'parked'
      ? (dateValue('judgment.parkedAt', next.parkedAt, null) || prior.parkedAt || new Date())
      : null,
    lessons: normalizeLessons(next.lessons || [], prior.lessons || []),
    dependsOn: normalizeDependencies(next.dependsOn || [], actorType, pageId),
    /* Per-case overnight silence. Not an event ignore — the same filing may
       still matter to another claim. */
    dismissedOvernightEventIds: cleanList(next.dismissedOvernightEventIds, 80)
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
  normalizeDependencies,
  normalizeJudgment,
  normalizeLessons
};
