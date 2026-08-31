/**
 * Stage 6 — Decision-memory API.
 *
 * Versioned schema over claims, evidence, dispositions, decisions, outcomes,
 * lineage, and receipts. Authorization and projection stay the Stage 4
 * boundary. Writes are idempotent. The audit can be replayed. Budgets cap
 * the rate. This is not a public score and not a federated network.
 */

const { serializePublicCasebook } = require('./judgmentPublicProjection');
const { can } = require('./livingTeam');

const SCHEMA_VERSION = 'decision-memory.v1';
const RESOURCES = Object.freeze([
  'claims',
  'evidence',
  'dispositions',
  'decisions',
  'outcomes',
  'lineage',
  'receipts'
]);
const WRITE_BUDGET = Object.freeze({ windowMs: 60 * 60 * 1000, max: 60 });

class DecisionMemoryError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'DecisionMemoryError';
    this.status = status;
    this.code = code;
  }
}

const clean = (value = '', limit = 400) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const iso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const ownerProjection = (page = {}, extras = {}) => {
  const raw = plain(page) || {};
  const judgment = plain(raw.judgment) || {};
  return {
    schema: SCHEMA_VERSION,
    visibility: 'owner',
    pageId: idOf(raw),
    claim: clean(judgment.currentJudgment, 8000),
    evidence: list(raw.sourceRefs).map((source) => ({
      id: idOf(source),
      type: clean(source.type || 'source', 40),
      title: clean(source.title || source.url, 240),
      url: clean(source.url, 1000)
    })).filter((row) => row.title),
    dispositions: list(judgment.verdicts).map((row) => ({
      id: idOf(row.verdictId || row),
      result: clean(row.result, 40),
      at: iso(row.recordedAt || row.at),
      note: clean(row.note, 400)
    })),
    decisions: {
      posture: clean(judgment.decisionPosture || judgment.status, 40),
      at: iso(judgment.decisionAt || judgment.startedAt)
    },
    outcomes: list(judgment.outcomes).map((row) => ({
      result: clean(row.result, 40),
      at: iso(row.observedAt || row.at),
      silent: Boolean(row.silence),
      lesson: clean(row.lesson, 400)
    })),
    lineage: extras.lineage || null,
    receipts: list(extras.receipts).map((row) => ({
      kind: clean(row.kind, 80),
      at: iso(row.at || row.createdAt),
      summary: clean(row.summary, 400)
    })),
    why: list(judgment.why).map((row) => clean(row.text, 400)).filter(Boolean)
  };
};

const publicProjection = (page = {}, extras = {}) => {
  const folio = serializePublicCasebook({
    page,
    revisions: extras.revisions || [],
    lineage: extras.lineage || {},
    receipts: extras.receipts || []
  });
  if (!folio) return null;
  return {
    schema: SCHEMA_VERSION,
    visibility: 'public',
    ...folio,
    why: undefined,
    against: undefined,
    confidence: undefined
  };
};

const project = ({ page, viewer, extras = {}, team = null } = {}) => {
  if (!page) throw new DecisionMemoryError('This case was not found.', 404, 'not_found');
  const owner = idOf(page.userId);
  const viewerId = idOf(viewer?.id || viewer);
  if (!viewerId) throw new DecisionMemoryError('Sign in to read decision memory.', 401, 'unauthorized');
  if (viewerId === owner) return ownerProjection(page, extras);
  if (team && can(viewer, 'observe', team.mandate)) {
    const projected = ownerProjection(page, extras);
    return { ...projected, visibility: 'overlay', why: [] };
  }
  return publicProjection(page, extras);
};

const idempotencyKey = ({ userId, requestId, action, pageId }) => (
  `${SCHEMA_VERSION}:${idOf(userId)}:${clean(action, 40)}:${idOf(pageId)}:${clean(requestId, 80)}`
);

const replayAudit = (events = []) => list(events)
  .slice()
  .sort((left, right) => String(iso(left.at) || '').localeCompare(String(iso(right.at) || '')))
  .map((row) => ({
    at: iso(row.at),
    kind: clean(row.kind, 80),
    action: clean(row.action, 40),
    pageId: idOf(row.pageId),
    requestId: clean(row.requestId, 80),
    summary: clean(row.summary, 400)
  }));

const withinBudget = (writes = [], { now = new Date(), budget = WRITE_BUDGET } = {}) => {
  const cutoff = (now instanceof Date ? now.getTime() : new Date(now).getTime()) - budget.windowMs;
  const recent = list(writes).filter((row) => {
    const at = new Date(row.at || row).getTime();
    return Number.isFinite(at) && at >= cutoff;
  });
  if (recent.length >= budget.max) {
    throw new DecisionMemoryError(
      'The decision-memory budget for this hour is spent.',
      429,
      'budget_exhausted'
    );
  }
  return { remaining: budget.max - recent.length, spent: recent.length };
};

module.exports = {
  RESOURCES,
  SCHEMA_VERSION,
  WRITE_BUDGET,
  DecisionMemoryError,
  idempotencyKey,
  ownerProjection,
  project,
  publicProjection,
  replayAudit,
  withinBudget
};
