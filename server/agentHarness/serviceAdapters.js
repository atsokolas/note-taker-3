const clean = (value) => String(value || '').trim();

const STRUCTURE_OPERATION_TYPES = new Set(['create_folder', 'move_item', 'rename_folder', 'merge_folder', 'delete_folder']);
const MEMORY_UPDATE_TYPES = new Set(['current_focus', 'open_question', 'next_move']);

const slug = (value = '') => (
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
);

const riskForStructureProposal = (value = '') => {
  const safe = clean(value).toLowerCase();
  if (safe === 'medium') return 'medium';
  return 'low';
};

const operationPayloadFromTitle = ({ type = '', title = '' } = {}) => {
  const safeTitle = clean(title);
  if (type === 'create_folder') {
    return {
      name: safeTitle
        .replace(/^create\s+(a\s+)?(new\s+)?folder\s+(named\s+)?/i, '')
        .replace(/^create\s+/i, '')
        .replace(/^["']|["']$/g, '')
        .trim() || safeTitle
    };
  }
  if (type === 'rename_folder') {
    return {
      proposedName: safeTitle,
      requiresResolution: true
    };
  }
  if (type === 'move_item') {
    return {
      itemTitle: safeTitle,
      requiresResolution: true
    };
  }
  return {
    description: safeTitle,
    requiresResolution: true
  };
};

const buildStructureProposalDraft = ({
  output = {},
  userId = '',
  threadId = '',
  runId = '',
  bundleId = 'agent-harness:librarian',
  scope = 'workspace',
  scopeRef = 'agent-harness',
  actor = { actorType: 'native_agent', actorId: 'agent-harness' }
} = {}) => {
  const operations = (Array.isArray(output.operations) ? output.operations : [])
    .filter((operation) => STRUCTURE_OPERATION_TYPES.has(clean(operation?.type)))
    .map((operation, index) => {
      const type = clean(operation.type);
      const title = clean(operation.title) || `Operation ${index + 1}`;
      return {
        opId: `${type}-${index + 1}`,
        type,
        targetDomain: 'notebook',
        status: 'pending',
        payload: operationPayloadFromTitle({ type, title }),
        preview: {
          title,
          requiresApproval: operation.requiresApproval === true,
          source: 'agent_harness'
        },
        risk: riskForStructureProposal(output.riskLevel),
        undoPayload: {}
      };
    });

  return {
    userId,
    sourceThreadId: clean(threadId),
    sourceRunId: clean(runId),
    sourceBundleId: clean(bundleId),
    scope,
    scopeRef,
    status: 'pending',
    title: clean(output.title) || 'Agent harness structure proposal',
    summary: clean(output.summary),
    rationale: clean(output.rationale || output.summary),
    operations,
    createdBy: actor
  };
};

const createStructureProposalFromHarness = async ({
  AgentStructureProposal,
  output = {},
  userId = '',
  threadId = '',
  runId = '',
  bundleId = 'agent-harness:librarian',
  scope = 'workspace',
  scopeRef = 'agent-harness',
  actor
} = {}) => {
  const payload = buildStructureProposalDraft({
    output,
    userId,
    threadId,
    runId,
    bundleId,
    scope,
    scopeRef,
    actor
  });
  if (!AgentStructureProposal || typeof AgentStructureProposal.create !== 'function') {
    return { payload, created: null };
  }
  const created = await AgentStructureProposal.create(payload);
  return { payload, created };
};

const buildWorkingMemoryDrafts = ({
  output = {},
  userId = '',
  workspaceType = 'workspace',
  workspaceId = 'agent-harness',
  sourceIdPrefix = 'agent-harness:memory-steward'
} = {}) => {
  const updates = Array.isArray(output.updates) ? output.updates : [];
  return updates
    .filter((update) => MEMORY_UPDATE_TYPES.has(clean(update?.type)) && clean(update?.text))
    .map((update) => {
      const type = clean(update.type);
      return {
        sourceType: 'agent_harness.memory_steward',
        sourceId: `${sourceIdPrefix}:${slug(type)}`,
        textSnippet: clean(update.text).slice(0, 1200),
        tags: ['agent-harness', 'memory-steward', type],
        status: 'active',
        processedAt: null,
        processedReason: '',
        workspaceType: clean(workspaceType) || 'workspace',
        workspaceId: clean(workspaceId),
        userId
      };
    });
};

const writeWorkingMemoryUpdatesFromHarness = async ({
  WorkingMemoryItem,
  output = {},
  userId = '',
  workspaceType = 'workspace',
  workspaceId = 'agent-harness',
  sourceIdPrefix = 'agent-harness:memory-steward',
  dedupe = false
} = {}) => {
  const payloads = buildWorkingMemoryDrafts({
    output,
    userId,
    workspaceType,
    workspaceId,
    sourceIdPrefix
  });
  if (!WorkingMemoryItem || typeof WorkingMemoryItem.create !== 'function') {
    return { payloads, created: [], skippedExisting: [] };
  }
  const created = [];
  const skippedExisting = [];
  for (const payload of payloads) {
    if (dedupe && typeof WorkingMemoryItem.findOne === 'function') {
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
  return { payloads, created, skippedExisting };
};

const buildServiceDraftForHarnessResult = (result = {}, options = {}) => {
  if (result.id === 'librarian') {
    return {
      type: 'AgentStructureProposal',
      payload: buildStructureProposalDraft({
        output: result.output,
        ...options
      })
    };
  }
  if (result.id === 'memory_steward') {
    return {
      type: 'WorkingMemoryItem[]',
      payloads: buildWorkingMemoryDrafts({
        output: result.output,
        ...options
      })
    };
  }
  return null;
};

module.exports = {
  buildStructureProposalDraft,
  createStructureProposalFromHarness,
  buildWorkingMemoryDrafts,
  writeWorkingMemoryUpdatesFromHarness,
  buildServiceDraftForHarnessResult
};
