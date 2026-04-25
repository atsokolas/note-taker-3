const clean = (value) => String(value || '').trim();

const MEMORY_APPROVAL_OP = 'memory.commit';
const MEMORY_UPDATE_TYPES = new Set(['current_focus', 'open_question', 'next_move']);

const slug = (value = '') => (
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
);

const normalizeActor = (actor = {}, fallbackType = 'native_agent') => ({
  actorType: clean(actor.actorType).toLowerCase() || fallbackType,
  actorId: clean(actor.actorId)
});

const normalizeMemoryApprovalItems = ({
  updates = [],
  userId = '',
  workspaceType = 'workspace',
  workspaceId = '',
  sourceIdPrefix = 'agent-memory-approval'
} = {}) => (
  (Array.isArray(updates) ? updates : [])
    .filter((update) => MEMORY_UPDATE_TYPES.has(clean(update?.type)) && clean(update?.text))
    .map((update) => {
      const type = clean(update.type);
      return {
        sourceType: 'agent.memory_steward',
        sourceId: `${clean(sourceIdPrefix) || 'agent-memory-approval'}:${slug(type)}`,
        textSnippet: clean(update.text).slice(0, 1200),
        tags: ['agent-memory', 'memory-steward', type],
        status: 'active',
        processedAt: null,
        processedReason: '',
        workspaceType: clean(workspaceType) || 'workspace',
        workspaceId: clean(workspaceId),
        userId
      };
    })
);

const buildMemoryApprovalPreview = ({ items = [], threadId = '' } = {}) => ({
  title: `Commit ${items.length} memory ${items.length === 1 ? 'update' : 'updates'}`,
  threadId: clean(threadId),
  itemCount: items.length,
  snippets: (Array.isArray(items) ? items : [])
    .map((item) => clean(item.textSnippet).slice(0, 160))
    .filter(Boolean)
    .slice(0, 5)
});

const createMemoryCommitApproval = async ({
  AgentProtocolApproval,
  userId = '',
  threadId = '',
  workspaceType = 'workspace',
  workspaceId = '',
  updates = [],
  sourceIdPrefix = '',
  reason = 'Memory steward updates require approval before committing to working memory.',
  requestedBy = { actorType: 'native_agent', actorId: 'memory_steward' }
} = {}) => {
  const items = normalizeMemoryApprovalItems({
    updates,
    userId,
    workspaceType,
    workspaceId,
    sourceIdPrefix: sourceIdPrefix || `memory-approval:${clean(threadId) || 'thread'}`
  });
  if (items.length === 0) {
    const error = new Error('At least one valid memory update is required.');
    error.status = 400;
    throw error;
  }
  const payload = {
    threadId: clean(threadId),
    workspaceType: clean(workspaceType) || 'workspace',
    workspaceId: clean(workspaceId),
    items
  };
  if (!AgentProtocolApproval || typeof AgentProtocolApproval.create !== 'function') {
    return { approval: null, payload, preview: buildMemoryApprovalPreview({ items, threadId }) };
  }
  const approval = await AgentProtocolApproval.create({
    userId,
    status: 'pending',
    scope: 'agent_ops',
    op: MEMORY_APPROVAL_OP,
    payload,
    preview: buildMemoryApprovalPreview({ items, threadId }),
    reason: clean(reason),
    requestedBy: normalizeActor(requestedBy, 'native_agent')
  });
  return { approval, payload, preview: approval.preview };
};

const executeMemoryCommitApproval = async ({
  WorkingMemoryItem,
  approval
} = {}) => {
  const items = Array.isArray(approval?.payload?.items) ? approval.payload.items : [];
  if (items.length === 0) {
    const error = new Error('Memory approval payload has no items.');
    error.status = 400;
    throw error;
  }
  if (!WorkingMemoryItem || typeof WorkingMemoryItem.create !== 'function') {
    const error = new Error('WorkingMemoryItem model is required.');
    error.status = 500;
    throw error;
  }
  const created = [];
  const skippedExisting = [];
  for (const item of items) {
    const payload = {
      sourceType: clean(item.sourceType) || 'agent.memory_steward',
      sourceId: clean(item.sourceId),
      textSnippet: clean(item.textSnippet).slice(0, 1200),
      tags: Array.isArray(item.tags) ? item.tags.map(clean).filter(Boolean).slice(0, 20) : ['agent-memory'],
      status: 'active',
      processedAt: null,
      processedReason: '',
      workspaceType: clean(item.workspaceType || approval?.payload?.workspaceType) || 'workspace',
      workspaceId: clean(item.workspaceId || approval?.payload?.workspaceId),
      userId: item.userId || approval?.userId
    };
    if (!payload.sourceId || !payload.textSnippet) continue;
    if (typeof WorkingMemoryItem.findOne === 'function') {
      const existing = await WorkingMemoryItem.findOne({
        userId: payload.userId,
        sourceType: payload.sourceType,
        sourceId: payload.sourceId,
        workspaceType: payload.workspaceType,
        workspaceId: payload.workspaceId
      });
      if (existing) {
        skippedExisting.push(existing);
        continue;
      }
    }
    created.push(await WorkingMemoryItem.create(payload));
  }
  return {
    createdCount: created.length,
    skippedExistingCount: skippedExisting.length,
    itemCount: items.length,
    created,
    skippedExisting
  };
};

module.exports = {
  MEMORY_APPROVAL_OP,
  buildMemoryApprovalPreview,
  createMemoryCommitApproval,
  executeMemoryCommitApproval,
  normalizeMemoryApprovalItems
};
