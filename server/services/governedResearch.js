/**
 * Stage 6 — Governed autonomous research.
 *
 * Agents monitor, propose, and route. Authorized humans accept. Nothing
 * writes the belief unattended. Mandates are scoped. Silence is qualified.
 * A proposal can be reversed. A watch can be killed.
 */

const ACTIONS = Object.freeze(['monitor', 'propose', 'route', 'accept', 'reverse', 'kill', 'escalate']);
const STATUSES = Object.freeze(['watching', 'silent', 'proposed', 'accepted', 'reversed', 'killed']);

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
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const iso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const sourceKey = (source = {}) => (
  clean(source.url || source.sourceId || source.title, 240).toLowerCase()
);

const digestProposal = (proposal = {}) => [
  clean(proposal.claimText, 400),
  sourceKey(proposal.source || {}),
  clean(proposal.summary, 400)
].join('|');

const openMandate = ({
  purpose = '',
  sources = [],
  budget = 3,
  pageId,
  actorId,
  now = new Date()
} = {}) => {
  const named = clean(purpose, 400);
  if (!named) throw new GovernedResearchError('A watch needs a purpose.');
  const cap = Math.max(0, Math.min(20, Number(budget) || 0));
  return {
    pageId: idOf(pageId),
    purpose: named,
    sources: list(sources).map((row) => ({
      title: clean(row.title, 240),
      url: clean(row.url, 1000),
      sourceId: idOf(row.sourceId || row.id)
    })).filter((row) => row.title || row.url || row.sourceId),
    budget: { proposals: cap, remaining: cap, spent: 0 },
    status: 'watching',
    killedAt: null,
    killedBy: null,
    openedAt: iso(now),
    openedBy: idOf(actorId),
    proposals: []
  };
};

const isKilled = (mandate) => mandate?.status === 'killed' || Boolean(mandate?.killedAt);

const proposeFromWatch = (mandate, proposal = {}, { now = new Date() } = {}) => {
  if (!mandate) throw new GovernedResearchError('There is no watch.');
  if (isKilled(mandate)) throw new GovernedResearchError('This watch was killed.', 'killed');
  if ((mandate.budget?.remaining || 0) <= 0) {
    throw new GovernedResearchError('The mandate has no remaining proposals.', 'budget_exhausted');
  }
  const summary = clean(proposal.summary, 400);
  const source = {
    title: clean(proposal.source?.title, 240),
    url: clean(proposal.source?.url, 1000),
    sourceId: idOf(proposal.source?.sourceId || proposal.source?.id)
  };
  if (!summary && !source.title && !source.url) {
    return {
      mandate: { ...mandate, status: 'silent' },
      proposal: null,
      silence: 'The world did not move.'
    };
  }
  const fingerprint = digestProposal({ ...proposal, source, summary });
  const duplicate = list(mandate.proposals).find((row) => row.fingerprint === fingerprint && row.status !== 'reversed');
  if (duplicate) {
    return {
      mandate,
      proposal: { ...duplicate, duplicateOf: duplicate.id },
      silence: ''
    };
  }
  const row = {
    id: idOf(proposal.id) || `watch:${iso(now)}:${fingerprint.slice(0, 12)}`,
    action: 'propose',
    summary,
    claimText: clean(proposal.claimText, 800),
    source,
    fingerprint,
    reversible: true,
    generated: true,
    generatedLabel: 'Proposed by the watch. Not yet accepted.',
    status: 'proposed',
    proposedAt: iso(now),
    provenance: { source, at: iso(now) }
  };
  const spent = (mandate.budget.spent || 0) + 1;
  const remaining = Math.max(0, (mandate.budget.proposals || 0) - spent);
  return {
    mandate: {
      ...mandate,
      status: 'proposed',
      budget: { ...mandate.budget, spent, remaining },
      proposals: list(mandate.proposals).concat(row)
    },
    proposal: row,
    silence: ''
  };
};

const acceptProposal = (mandate, proposalId, { actorId, now = new Date() } = {}) => {
  if (isKilled(mandate)) throw new GovernedResearchError('This watch was killed.', 'killed');
  const rows = list(mandate.proposals);
  const index = rows.findIndex((row) => idOf(row.id) === idOf(proposalId));
  if (index < 0) throw new GovernedResearchError('That proposal is not on this watch.');
  const next = rows.slice();
  next[index] = {
    ...rows[index],
    status: 'accepted',
    acceptedAt: iso(now),
    acceptedBy: idOf(actorId)
  };
  return { ...mandate, status: 'watching', proposals: next };
};

const reverseProposal = (mandate, proposalId, { actorId, now = new Date() } = {}) => {
  const rows = list(mandate.proposals);
  const index = rows.findIndex((row) => idOf(row.id) === idOf(proposalId));
  if (index < 0) throw new GovernedResearchError('That proposal is not on this watch.');
  if (!rows[index].reversible) throw new GovernedResearchError('That proposal is not reversible.');
  const next = rows.slice();
  next[index] = {
    ...rows[index],
    status: 'reversed',
    reversedAt: iso(now),
    reversedBy: idOf(actorId)
  };
  return { ...mandate, proposals: next };
};

const killWatch = (mandate, { actorId, now = new Date() } = {}) => {
  if (!mandate) throw new GovernedResearchError('There is no watch to kill.');
  return {
    ...mandate,
    status: 'killed',
    killedAt: iso(now),
    killedBy: idOf(actorId)
  };
};

const escalate = (mandate, { reason = '', actorId, now = new Date() } = {}) => ({
  ...mandate,
  escalations: list(mandate.escalations).concat({
    at: iso(now),
    actorId: idOf(actorId),
    reason: clean(reason, 400) || 'A human asked the watch to stop and speak.'
  })
});

const serializeWatch = (mandate) => {
  if (!mandate) return { silent: true, note: '' };
  if (isKilled(mandate)) {
    return { silent: true, killed: true, note: 'The watch was killed. Nothing writes itself in.' };
  }
  const open = list(mandate.proposals).filter((row) => row.status === 'proposed');
  if (!open.length && mandate.status === 'silent') {
    return { silent: true, note: 'The world did not move.' };
  }
  return {
    silent: open.length === 0,
    killed: false,
    purpose: mandate.purpose,
    budget: mandate.budget,
    proposals: open,
    note: open.length
      ? 'The watch left a note. It has not written the claim.'
      : 'The watch is on. It will speak only if the world moves.'
  };
};

module.exports = {
  ACTIONS,
  STATUSES,
  GovernedResearchError,
  acceptProposal,
  digestProposal,
  escalate,
  killWatch,
  openMandate,
  proposeFromWatch,
  reverseProposal,
  serializeWatch
};
