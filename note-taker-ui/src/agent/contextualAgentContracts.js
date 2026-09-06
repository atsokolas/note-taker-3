export const CONTEXTUAL_AGENT_CONTRACT_VERSION = 1;

export const CONTEXTUAL_AGENT_PRESENTATIONS = Object.freeze({
  rail: 'rail',
  embedded: 'embedded'
});

const contract = ({
  id,
  room,
  roleLabel,
  roleDescription,
  agentId = 'agent.context-partner',
  presentation = CONTEXTUAL_AGENT_PRESENTATIONS.rail,
  capabilities = [],
  actions = [],
  match
}) => Object.freeze({
  schemaVersion: CONTEXTUAL_AGENT_CONTRACT_VERSION,
  id,
  room,
  roleLabel,
  roleDescription,
  agentId,
  presentation,
  capabilities: Object.freeze([...capabilities]),
  actions: Object.freeze([...actions]),
  proposalPolicy: 'human_acceptance',
  match
});

/*
 * One declarative authority for where the contextual agent lives and what it
 * may do. The contracts name capabilities; the shell owns the durable chat
 * transport while pages expose only exact, accepted domain writes.
 *
 * The Wiki workspace is deliberately explicit. It has the same product agent
 * in an embedded workbench projection because building, ingesting, linting and
 * maintaining need the wider composer. The persistent rail therefore does not
 * mount beside it, and no route-exclusion list gets to invent a second policy.
 */
export const CONTEXTUAL_AGENT_CONTRACTS = Object.freeze([
  contract({
    id: 'agent-surface.wiki-workspace',
    room: 'wiki',
    presentation: CONTEXTUAL_AGENT_PRESENTATIONS.embedded,
    capabilities: ['capability.library.retrieve', 'capability.wiki.build', 'capability.wiki.maintain'],
    actions: ['retrieve', 'reference', 'build', 'ingest', 'lint', 'maintain'],
    match: ({ pathname }) => String(pathname || '').startsWith('/wiki/workspace')
  }),
  contract({
    id: 'agent-surface.library',
    room: 'library',
    roleLabel: 'Source guide',
    roleDescription: 'Follows the source, its provenance, and where it connects.',
    capabilities: ['capability.library.retrieve', 'capability.knowledge.connect'],
    actions: ['retrieve', 'accept.keep'],
    match: ({ pathname }) => String(pathname || '').startsWith('/library')
  }),
  contract({
    id: 'agent-surface.think',
    room: 'think',
    roleLabel: 'Thought partner',
    roleDescription: 'Works beside the thought without writing over it.',
    capabilities: ['capability.library.retrieve', 'capability.knowledge.connect'],
    actions: ['retrieve', 'accept.append'],
    match: ({ pathname }) => String(pathname || '').startsWith('/think')
  }),
  contract({
    id: 'agent-surface.wiki',
    room: 'wiki',
    roleLabel: 'Wiki steward',
    roleDescription: 'Checks the accepted page against its sources and maintenance history.',
    capabilities: ['capability.library.retrieve', 'capability.wiki.maintain'],
    actions: ['retrieve', 'accept.edit'],
    match: ({ pathname }) => {
      const path = String(pathname || '');
      return (path === '/wiki' || path.startsWith('/wiki/'))
        && !path.startsWith('/wiki/activity')
        && !path.startsWith('/wiki/workspace');
    }
  }),
  contract({
    id: 'agent-surface.judgment',
    room: 'judgment',
    roleLabel: 'Skeptical partner',
    roleDescription: 'Tests the live judgment against support, counterevidence, and unknowns.',
    capabilities: ['capability.library.retrieve', 'capability.judgment.review'],
    actions: ['retrieve', 'accept.why', 'accept.against', 'accept.criteria'],
    match: ({ pathname }) => String(pathname || '').startsWith('/judgment')
  })
]);

const CONTRACT_BY_ID = new Map(CONTEXTUAL_AGENT_CONTRACTS.map(item => [item.id, item]));

export const getContextualAgentContract = (id = '') => CONTRACT_BY_ID.get(String(id || '').trim()) || null;

export const resolveContextualAgentContract = ({ pathname = '' } = {}) => (
  CONTEXTUAL_AGENT_CONTRACTS.find(item => item.match({ pathname })) || null
);

export const hasContextualAgentRail = (pathname = '') => (
  resolveContextualAgentContract({ pathname })?.presentation === CONTEXTUAL_AGENT_PRESENTATIONS.rail
);

const normalizeLines = (lines) => (Array.isArray(lines) ? lines.filter(Boolean) : []);

export const buildContextualAgentSurface = (contractId, context = {}) => {
  const resolved = getContextualAgentContract(contractId);
  if (!resolved || resolved.presentation !== CONTEXTUAL_AGENT_PRESENTATIONS.rail) return null;

  const objectType = String(context.objectType || resolved.room || '').trim();
  const objectId = String(context.objectId || resolved.room || '').trim();
  const subject = String(context.subject || context.title || '').trim();
  const pageId = String(context.pageId || '').trim();
  const claimId = String(context.claimId || (objectType === 'wiki_claim' ? objectId : '')).trim();

  return {
    id: objectId ? `${resolved.room}:${objectType}:${objectId}` : resolved.id,
    contractId: resolved.id,
    agentId: resolved.agentId,
    room: resolved.room,
    roleLabel: String(context.roleLabel || resolved.roleLabel || 'Agent').trim(),
    roleDescription: String(context.roleDescription || resolved.roleDescription || '').trim(),
    objectType,
    objectId,
    pageId,
    claimId,
    subject,
    // How much the agent can actually see. null means the surface has not
    // declared a corpus; 0 is a real answer and must be said out loud.
    boundSources: Number.isFinite(Number(context.boundSources))
      ? Math.max(0, Math.trunc(Number(context.boundSources)))
      : null,
    lines: normalizeLines(context.lines),
    empty: String(context.empty || 'Nothing to retrieve until you ask.').trim(),
    askPlaceholder: String(context.askPlaceholder || 'Bring evidence or counterevidence').trim(),
    caption: String(context.caption || 'Retrieves. You accept.').trim(),
    supportedActions: [...resolved.actions],
    capabilities: [...resolved.capabilities],
    proposalPolicy: resolved.proposalPolicy
  };
};

export const filterContextualAgentHandlers = (contractId, handlers = {}) => {
  const resolved = getContextualAgentContract(contractId);
  if (!resolved || resolved.presentation !== CONTEXTUAL_AGENT_PRESENTATIONS.rail) return {};
  const accepts = resolved.actions.some(action => action.startsWith('accept.'));
  return {
    ...(accepts && typeof handlers.onAccept === 'function'
      ? { onAccept: handlers.onAccept }
      : {})
  };
};
