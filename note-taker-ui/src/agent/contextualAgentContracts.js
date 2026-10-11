import { AGENT_DISPLAY_NAME } from '../constants/agentIdentity';

export const CONTEXTUAL_AGENT_CONTRACT_VERSION = 1;

const contract = ({
  id,
  room,
  agentId = 'agent.context-partner',
  capabilities = ['capability.library.retrieve'],
  actions = ['retrieve'],
  match = () => false
}) => Object.freeze({
  schemaVersion: CONTEXTUAL_AGENT_CONTRACT_VERSION,
  id,
  room,
  agentId,
  capabilities: Object.freeze([...capabilities]),
  actions: Object.freeze([...actions]),
  proposalPolicy: 'human_acceptance',
  match
});

const under = prefix => ({ pathname }) => String(pathname || '').startsWith(prefix);

/*
 * One Partner, five rooms. Each contract names what the Partner may do in a
 * room; the panel owns the conversation and the room supplies only its exact,
 * accepted write. Nothing it retrieves is written down without a click.
 */
export const CONTEXTUAL_AGENT_CONTRACTS = Object.freeze([
  contract({
    id: 'agent-surface.library',
    room: 'library',
    capabilities: ['capability.library.retrieve', 'capability.knowledge.connect'],
    actions: ['retrieve', 'accept.keep'],
    match: under('/library')
  }),
  contract({
    id: 'agent-surface.think',
    room: 'think',
    capabilities: ['capability.library.retrieve', 'capability.knowledge.connect'],
    // Wording the Partner offers is tried in the draft, never written into it.
    actions: ['retrieve', 'try-wording'],
    match: under('/think')
  }),
  contract({
    id: 'agent-surface.wiki',
    room: 'wiki',
    capabilities: ['capability.library.retrieve', 'capability.wiki.maintain'],
    actions: ['retrieve', 'accept.edit'],
    match: ({ pathname }) => {
      const path = String(pathname || '');
      return (path === '/wiki' || path.startsWith('/wiki/')) && !path.startsWith('/wiki/activity');
    }
  }),
  contract({
    id: 'agent-surface.judgment',
    room: 'judgment',
    capabilities: ['capability.library.retrieve', 'capability.judgment.review'],
    actions: ['retrieve', 'accept.why', 'accept.against', 'accept.criteria'],
    match: under('/judgment')
  }),
  contract({
    id: 'agent-surface.editions',
    room: 'editions',
    match: under('/editions')
  }),
  // A published question, for a signed-in visitor. It reads only the door.
  contract({
    id: 'agent-surface.shared-question',
    room: 'shared_question'
  })
]);

const CONTRACT_BY_ID = new Map(CONTEXTUAL_AGENT_CONTRACTS.map(item => [item.id, item]));

export const getContextualAgentContract = (id = '') => CONTRACT_BY_ID.get(String(id || '').trim()) || null;

export const resolveContextualAgentContract = ({ pathname = '' } = {}) => (
  CONTEXTUAL_AGENT_CONTRACTS.find(item => item.match({ pathname })) || null
);

export const hasPartnerPanel = (pathname = '') => Boolean(resolveContextualAgentContract({ pathname }));

/* What the Partner is looking at, said the way a reader would. */
const SCOPE_BY_OBJECT_TYPE = Object.freeze({
  article: 'this source',
  highlight: 'this source',
  folder: 'this shelf',
  notebook: 'this note',
  note: 'this note',
  concept: 'this concept',
  question: 'this question',
  wiki_page: 'this page',
  wiki_claim: 'this page',
  judgment_claim: 'this view',
  edition: 'this issue',
  shared_question: 'this question'
});

export const describePartnerScope = (objectType = '') => (
  SCOPE_BY_OBJECT_TYPE[String(objectType || '').trim()] || 'everything'
);

const normalizeLines = (lines) => (Array.isArray(lines) ? lines.filter(Boolean) : []);

export const buildContextualAgentSurface = (contractId, context = {}) => {
  const resolved = getContextualAgentContract(contractId);
  if (!resolved) return null;

  const objectType = String(context.objectType || resolved.room || '').trim();
  const objectId = String(context.objectId || resolved.room || '').trim();
  const pageId = String(context.pageId || '').trim();
  const claimId = String(context.claimId || (objectType === 'wiki_claim' ? objectId : '')).trim();
  const scope = describePartnerScope(objectType);

  return {
    id: objectId ? `${resolved.room}:${objectType}:${objectId}` : resolved.id,
    contractId: resolved.id,
    agentId: resolved.agentId,
    room: resolved.room,
    roleLabel: AGENT_DISPLAY_NAME,
    scope,
    objectType,
    objectId,
    pageId,
    claimId,
    ...(context.exploration ? { exploration: context.exploration } : {}),
    subject: String(context.subject || context.title || '').trim(),
    summary: String(context.summary || '').trim(),
    lines: normalizeLines(context.lines),
    caption: String(context.caption || '').trim()
      || (scope === 'everything' ? 'Ask about anything you have read.' : `Ask about ${scope}.`),
    askPlaceholder: String(context.askPlaceholder || 'Ask about this').trim(),
    supportedActions: [...resolved.actions],
    capabilities: [...resolved.capabilities],
    proposalPolicy: resolved.proposalPolicy
  };
};

export const filterContextualAgentHandlers = (contractId, handlers = {}) => {
  const resolved = getContextualAgentContract(contractId);
  if (!resolved) return {};
  const allows = action => resolved.actions.some(item => item === action || item.startsWith(`${action}.`));
  return Object.fromEntries([
    ['onAccept', 'accept'],
    ['onTryWording', 'try-wording']
  ].filter(([name, action]) => allows(action) && typeof handlers[name] === 'function')
    .map(([name]) => [name, handlers[name]]));
};
