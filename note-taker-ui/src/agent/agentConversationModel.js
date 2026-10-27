import { buildCanonicalArticlePath } from '../utils/sourceRoutes';
import { sourceTitle } from '../utils/sourceDisplayText';

const clean = (value) => String(value || '').trim();

const CONTEXT_TYPE_ALIASES = Object.freeze({
  judgment_claim: 'wiki_page',
  wiki: 'wiki_page',
  wiki_workspace: 'workspace',
  judgment_index: 'workspace',
  contradiction_index: 'workspace',
  library_workspace: 'workspace',
  think_workspace: 'think'
});

export const buildAgentContextFromIdentity = ({ type, id, title = '', metadata = null } = {}) => {
  const rawType = clean(type).toLowerCase();
  const safeId = clean(id);
  if (!rawType || !safeId) return null;
  const resolvedType = CONTEXT_TYPE_ALIASES[rawType] || rawType;
  return {
    type: resolvedType,
    id: safeId,
    title: clean(title),
    ...(['wiki_page'].includes(resolvedType) ? { pageId: safeId } : {}),
    metadata: metadata && typeof metadata === 'object' ? metadata : {}
  };
};

export const buildAgentContext = (surface = {}) => {
  const rawType = clean(surface.objectType || surface.room || 'workspace').toLowerCase();
  const claimId = clean(surface.claimId || (rawType === 'wiki_claim' ? surface.objectId : ''));
  const pageId = clean(surface.pageId);
  const openedClaim = rawType === 'wiki_claim';
  const type = openedClaim ? 'wiki_page' : (CONTEXT_TYPE_ALIASES[rawType] || rawType);
  const id = openedClaim
    ? pageId
    : clean(surface.objectId || surface.id || surface.room || 'workspace');
  const title = clean(surface.subject || surface.title || surface.roleLabel || 'Workspace');

  return buildAgentContextFromIdentity({
    type,
    id,
    title,
    metadata: {
      room: clean(surface.room),
      contractId: clean(surface.contractId),
      objectType: rawType,
      ...(claimId ? { claimId } : {}),
      ...(clean(surface.summary) ? { summary: clean(surface.summary) } : {}),
      ...(openedClaim && title ? { primaryText: title } : {}),
      ...(openedClaim && surface.exploration ? { exploration: surface.exploration } : {})
    }
  });
};

export const mapAgentThreadMessages = (thread = null) => (
  Array.isArray(thread?.messages)
    ? thread.messages.map((message, index) => ({
        id: `${clean(thread?.threadId) || 'thread'}-${message?.createdAt || index}-${index}`,
        role: clean(message?.role).toLowerCase() === 'assistant' ? 'assistant' : 'user',
        text: clean(message?.text),
        createdAt: clean(message?.createdAt),
        relatedItems: Array.isArray(message?.relatedItems) ? message.relatedItems : [],
        suggestedActions: Array.isArray(message?.suggestedActions) ? message.suggestedActions : [],
        proposalBundle: message?.proposalBundle && typeof message.proposalBundle === 'object'
          ? message.proposalBundle
          : null,
        planner: message?.metadata?.planner && typeof message.metadata.planner === 'object'
          ? message.metadata.planner
          : null,
        capability: message?.metadata?.capability && typeof message.metadata.capability === 'object'
          ? message.metadata.capability
          : null,
        modelRoute: message?.metadata?.modelRoute && typeof message.metadata.modelRoute === 'object'
          ? message.metadata.modelRoute
          : null,
        mode: clean(message?.metadata?.mode),
        premiumWebResearchAvailable: Boolean(message?.metadata?.premiumWebResearchAvailable)
      })).filter((message) => message.text)
    : []
);

export const buildAgentMessage = ({ role, text, result = null } = {}) => ({
  id: `${role || 'message'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role: role === 'assistant' ? 'assistant' : 'user',
  text: clean(text),
  createdAt: new Date().toISOString(),
  relatedItems: Array.isArray(result?.relatedItems) ? result.relatedItems : [],
  suggestedActions: Array.isArray(result?.suggestedActions) ? result.suggestedActions : [],
  proposalBundle: result?.proposalBundle && typeof result.proposalBundle === 'object'
    ? result.proposalBundle
    : null,
  planner: result?.planner && typeof result.planner === 'object' ? result.planner : null,
  capability: result?.capability && typeof result.capability === 'object' ? result.capability : null,
  modelRoute: result?.modelRoute && typeof result.modelRoute === 'object' ? result.modelRoute : null,
  mode: clean(result?.mode)
});

/* A Judgment can converse about anything, but it may only file a passage the
   Library can open again. The agent reply is commentary; the saved article
   excerpt is evidence. Keeping that distinction here lets every room share
   one durable conversation without giving prose a back door into a belief. */
export const buildAgentEvidenceCandidates = (items = []) => (
  (Array.isArray(items) ? items : [])
    .map((item = {}) => {
      const type = clean(item.type).toLowerCase();
      const id = clean(item.id || item.itemId);
      const sentence = clean(item.snippet);
      const source = sourceTitle(item);
      if (type !== 'article' || !id || !sentence) return null;
      return {
        sentence,
        body: sentence,
        source,
        sourceLabel: source,
        acceptedFrom: `article:${id}`
      };
    })
    .filter(Boolean)
);

export const mapAgentStructureProposal = (proposal = {}) => ({
  structureProposalId: clean(proposal?.structureProposalId),
  sourceThreadId: clean(proposal?.sourceThreadId),
  sourceRunId: clean(proposal?.sourceRunId),
  status: clean(proposal?.status) || 'pending',
  scope: clean(proposal?.scope),
  scopeRef: clean(proposal?.scopeRef),
  title: clean(proposal?.title),
  summary: clean(proposal?.summary),
  rationale: clean(proposal?.rationale),
  acceptedAt: clean(proposal?.acceptedAt),
  rejectedAt: clean(proposal?.rejectedAt),
  rolledBackAt: clean(proposal?.rolledBackAt),
  executionResult: proposal?.executionResult && typeof proposal.executionResult === 'object'
    ? proposal.executionResult
    : null,
  operations: Array.isArray(proposal?.operations)
    ? proposal.operations.map((operation = {}) => ({
        opId: clean(operation?.opId),
        type: clean(operation?.type),
        targetDomain: clean(operation?.targetDomain),
        status: clean(operation?.status) || 'pending',
        payload: operation?.payload && typeof operation.payload === 'object' ? operation.payload : {},
        preview: operation?.preview && typeof operation.preview === 'object' ? operation.preview : {},
        risk: clean(operation?.risk),
        isActionable: operation?.isActionable !== false,
        invalidFields: Array.isArray(operation?.invalidFields)
          ? operation.invalidFields.map(value => clean(value)).filter(Boolean)
          : []
      }))
    : []
});

const SOURCE_HREF = Object.freeze({
  article: id => buildCanonicalArticlePath(id),
  wiki_page: id => `/wiki/read/${encodeURIComponent(id)}`,
  notebook: id => `/think?tab=notebook&entryId=${encodeURIComponent(id)}`
});

/* What the Partner read to answer, each one a way back to its source. */
export const sourcesReadFor = (message = {}) => (
  (Array.isArray(message.relatedItems) ? message.relatedItems : [])
    .map((item = {}) => {
      const title = clean(item.title);
      const id = clean(item.id);
      const type = clean(item.type).toLowerCase();
      return title ? { key: `${type}:${id || title}`, title, href: id && SOURCE_HREF[type] ? SOURCE_HREF[type](id) : '' } : null;
    })
    .filter(Boolean)
    .slice(0, 4)
);

/* A reply put together from passages alone says so, so its phrasing is not
   mistaken for the Partner's. */
export const answeredWithoutModel = (message = {}) => (
  message.role === 'assistant' && message.mode === 'internal_only'
);
