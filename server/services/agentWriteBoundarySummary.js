const clean = (value) => String(value || '').trim();

const AGENT_MEMORY_SOURCE_PATTERN = /memory[_-]?steward|agent[_-]?harness|native[_-]?agent/i;
const AGENT_MEMORY_TAGS = ['memory-steward', 'agent-harness', 'current_focus', 'open_question', 'next_move'];

const toIso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const runFind = async (model, query, { sort = { updatedAt: -1, createdAt: -1 }, limit = 5 } = {}) => {
  if (!model || typeof model.find !== 'function') return [];
  const result = model.find(query);
  const sorted = result && typeof result.sort === 'function' ? result.sort(sort) : result;
  const limited = sorted && typeof sorted.limit === 'function' ? sorted.limit(limit) : sorted;
  const rows = typeof limited?.then === 'function' ? await limited : limited;
  return Array.isArray(rows) ? rows : [];
};

const runCount = async (model, query) => {
  if (!model || typeof model.countDocuments !== 'function') return 0;
  return Number(await model.countDocuments(query)) || 0;
};

const sanitizeMemoryCommit = (item = {}) => {
  const source = typeof item.toObject === 'function' ? item.toObject() : item;
  return {
    id: clean(source._id || source.id),
    sourceType: clean(source.sourceType),
    sourceId: clean(source.sourceId),
    textSnippet: clean(source.textSnippet).slice(0, 240),
    tags: Array.isArray(source.tags) ? source.tags.map(clean).filter(Boolean).slice(0, 8) : [],
    status: clean(source.status || 'active'),
    workspaceType: clean(source.workspaceType || 'global'),
    workspaceId: clean(source.workspaceId),
    createdAt: toIso(source.createdAt),
    updatedAt: toIso(source.updatedAt)
  };
};

const sanitizeStructureProposal = (proposal = {}) => {
  const source = typeof proposal.toObject === 'function' ? proposal.toObject() : proposal;
  return {
    id: clean(source._id || source.structureProposalId || source.id),
    title: clean(source.title),
    summary: clean(source.summary),
    status: clean(source.status || 'pending'),
    scope: clean(source.scope),
    scopeRef: clean(source.scopeRef),
    operationCount: Array.isArray(source.operations) ? source.operations.length : 0,
    sourceThreadId: clean(source.sourceThreadId),
    sourceRunId: clean(source.sourceRunId),
    createdAt: toIso(source.createdAt),
    updatedAt: toIso(source.updatedAt)
  };
};

const buildMemoryQuery = ({ userId = '', workspaceType = '', workspaceId = '' } = {}) => {
  const query = {
    userId,
    $or: [
      { sourceType: AGENT_MEMORY_SOURCE_PATTERN },
      { tags: { $in: AGENT_MEMORY_TAGS } }
    ]
  };
  if (clean(workspaceType)) query.workspaceType = clean(workspaceType);
  if (clean(workspaceId)) query.workspaceId = clean(workspaceId);
  return query;
};

const buildStructureQuery = ({ userId = '', threadId = '' } = {}) => {
  const query = { userId };
  if (clean(threadId)) query.sourceThreadId = clean(threadId);
  return query;
};

const getAgentWriteBoundarySummary = async ({
  WorkingMemoryItem,
  AgentStructureProposal,
  userId = '',
  threadId = '',
  workspaceType = '',
  workspaceId = '',
  limit = 5
} = {}) => {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(Number(limit || 5))));
  const memoryQuery = buildMemoryQuery({ userId, workspaceType, workspaceId });
  const structureQuery = buildStructureQuery({ userId, threadId });

  const [
    memoryCommitCount,
    recentMemoryRows,
    pendingStructureCount,
    appliedStructureCount,
    rejectedStructureCount,
    recentStructureRows
  ] = await Promise.all([
    runCount(WorkingMemoryItem, memoryQuery),
    runFind(WorkingMemoryItem, memoryQuery, { sort: { createdAt: -1 }, limit: safeLimit }),
    runCount(AgentStructureProposal, { ...structureQuery, status: 'pending' }),
    runCount(AgentStructureProposal, { ...structureQuery, status: { $in: ['applied', 'partially_applied'] } }),
    runCount(AgentStructureProposal, { ...structureQuery, status: 'rejected' }),
    runFind(AgentStructureProposal, structureQuery, { sort: { updatedAt: -1, createdAt: -1 }, limit: safeLimit })
  ]);

  return {
    memoryCommits: {
      total: memoryCommitCount,
      recent: recentMemoryRows.map(sanitizeMemoryCommit)
    },
    structureProposals: {
      pending: pendingStructureCount,
      applied: appliedStructureCount,
      rejected: rejectedStructureCount,
      recent: recentStructureRows.map(sanitizeStructureProposal)
    },
    safetyBoundary: {
      directWriteType: 'working_memory',
      stagedWriteType: 'structure_proposal',
      directCommitCount: memoryCommitCount,
      pendingReviewCount: pendingStructureCount,
      posture: pendingStructureCount > 0
        ? 'Workspace structure changes are staged for review; memory updates may be direct commits.'
        : 'No pending structure proposals; memory updates remain visible as working-memory commits.'
    }
  };
};

module.exports = {
  buildMemoryQuery,
  buildStructureQuery,
  getAgentWriteBoundarySummary,
  sanitizeMemoryCommit,
  sanitizeStructureProposal
};
