/**
 * An agent assignment on a published question: owner, scope, tools, budget,
 * stop and review, paused when ownership or authority lapses.
 */

class GovernedResearchError extends Error {
  constructor(message, code = 'invalid_mandate') {
    super(message);
    this.name = 'GovernedResearchError';
    this.code = code;
  }
}

const clean = (value = '', limit = 400) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const iso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const AGENT_MANDATE_TOOLS = 'Ask about this published question (the public page only).';
const MANDATE_NEEDS_FIELDS = 'Name the owner, scope, tools, budget, stop condition, and review route.';
const AGENT_MANDATE_PAUSE = Object.freeze({
  ended: 'This assignment ended. The agent is paused.',
  owner: 'The accountable owner is no longer on this door. The agent is paused.',
  budget: 'The assigned budget is spent. The agent is paused.'
});

const agentMandateAsks = (value) => {
  const cap = Math.max(0, Math.min(20, Number(value) || 0));
  return Number.isFinite(cap) ? cap : 0;
};

const openAgentMandate = ({
  owner = '',
  ownerId,
  scope = '',
  tools = '',
  budget = 3,
  stop = '',
  review = '',
  now = new Date()
} = {}) => {
  const namedOwner = clean(owner, 80);
  const namedScope = clean(scope, 400);
  const namedTools = clean(tools, 400) || AGENT_MANDATE_TOOLS;
  const namedStop = clean(stop, 400);
  const namedReview = clean(review, 400);
  const asks = agentMandateAsks(budget?.asks ?? budget);
  if (!namedOwner || !namedScope || !namedStop || !namedReview || asks < 1) {
    throw new GovernedResearchError(MANDATE_NEEDS_FIELDS, 'incomplete_mandate');
  }
  return {
    owner: namedOwner,
    ownerId: idOf(ownerId),
    scope: namedScope,
    tools: namedTools,
    budget: { asks, remaining: asks, spent: 0 },
    stop: namedStop,
    review: namedReview,
    status: 'live',
    openedAt: iso(now),
    pausedAt: null,
    pause: ''
  };
};

const projectAgentMandate = (mandate) => {
  if (!mandate || typeof mandate !== 'object') return null;
  const owner = clean(mandate.owner, 80);
  const scope = clean(mandate.scope, 400);
  const tools = clean(mandate.tools, 400);
  const stop = clean(mandate.stop, 400);
  const review = clean(mandate.review, 400);
  const asks = agentMandateAsks(mandate.budget?.asks);
  const spent = Math.max(0, Number(mandate.budget?.spent) || 0);
  const remaining = Math.max(0, Number.isFinite(Number(mandate.budget?.remaining))
    ? Number(mandate.budget.remaining)
    : asks - spent);
  if (!owner || !scope || !tools || !stop || !review || asks < 1) return null;
  const paused = mandate.status === 'paused'
    || mandate.status === 'ended'
    || Boolean(mandate.pausedAt)
    || remaining <= 0;
  return {
    owner,
    scope,
    tools,
    budget: { asks, remaining, spent },
    stop,
    review,
    status: paused ? 'paused' : 'live',
    ...(iso(mandate.openedAt) ? { openedAt: iso(mandate.openedAt) } : {}),
    ...(paused ? {
      pause: clean(mandate.pause, 400)
        || (remaining <= 0 ? AGENT_MANDATE_PAUSE.budget : AGENT_MANDATE_PAUSE.ended),
      ...(iso(mandate.pausedAt) ? { pausedAt: iso(mandate.pausedAt) } : {})
    } : {})
  };
};

const evaluateAgentMandate = (mandate, { ownerId } = {}) => {
  const projected = projectAgentMandate(mandate);
  if (!projected) return { lapsed: false };
  if (projected.status === 'paused') {
    return { lapsed: true, reason: projected.pause };
  }
  if (mandate.ownerId && ownerId && idOf(mandate.ownerId) !== idOf(ownerId)) {
    return { lapsed: true, reason: AGENT_MANDATE_PAUSE.owner };
  }
  if (projected.budget.remaining <= 0) {
    return { lapsed: true, reason: AGENT_MANDATE_PAUSE.budget };
  }
  return { lapsed: false };
};

const pauseAgentMandate = (mandate, { reason = '', now = new Date() } = {}) => {
  if (!mandate) throw new GovernedResearchError('There is no assignment to pause.');
  const line = clean(reason, 400) || AGENT_MANDATE_PAUSE.ended;
  return {
    ...mandate,
    status: 'paused',
    pausedAt: iso(now),
    pause: line
  };
};

module.exports = {
  AGENT_MANDATE_PAUSE,
  AGENT_MANDATE_TOOLS,
  GovernedResearchError,
  MANDATE_NEEDS_FIELDS,
  evaluateAgentMandate,
  openAgentMandate,
  pauseAgentMandate,
  projectAgentMandate
};
