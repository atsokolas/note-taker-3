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
  const type = CONTEXT_TYPE_ALIASES[rawType] || rawType;
  const id = clean(surface.objectId || surface.id || surface.room || 'workspace');
  const title = clean(surface.subject || surface.title || surface.roleLabel || 'Workspace');

  return buildAgentContextFromIdentity({
    type,
    id,
    title,
    metadata: {
      room: clean(surface.room),
      contractId: clean(surface.contractId),
      objectType: rawType
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
        intent: message?.metadata?.intent && typeof message.metadata.intent === 'object'
          ? message.metadata.intent
          : null,
        capability: message?.metadata?.capability && typeof message.metadata.capability === 'object'
          ? message.metadata.capability
          : null,
        modelRoute: message?.metadata?.modelRoute && typeof message.metadata.modelRoute === 'object'
          ? message.metadata.modelRoute
          : null,
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
  intent: result?.intent && typeof result.intent === 'object' ? result.intent : null,
  capability: result?.capability && typeof result.capability === 'object' ? result.capability : null,
  modelRoute: result?.modelRoute && typeof result.modelRoute === 'object' ? result.modelRoute : null
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
      const source = clean(item.title) || 'Untitled source';
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

export const sourceLabelForAgentMessage = (message = {}) => {
  const titles = (Array.isArray(message.relatedItems) ? message.relatedItems : [])
    .map((item) => clean(item?.title))
    .filter(Boolean)
    .slice(0, 2);
  return titles.length ? `From ${titles.join(' and ')}` : '';
};
