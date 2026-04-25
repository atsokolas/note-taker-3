const { normalizeAgentRun } = require('./agentRuns');
const { applyStructureProposal } = require('./agentStructureExecution');

const clean = (value) => String(value || '').trim();

const clone = (value) => JSON.parse(JSON.stringify(value || null));
const STRUCTURE_OPERATION_STATUS_VALUES = new Set(['pending', 'approved', 'rejected', 'applied', 'skipped']);

const normalizeActor = (input = {}, fallbackType = 'user') => ({
  actorType: clean(input?.actorType).toLowerCase() || fallbackType,
  actorId: clean(input?.actorId)
});

const updateStep = (steps = [], opId = '', patch = {}) => (
  steps.map((step) => (
    clean(step.opId) === clean(opId)
      ? { ...step, ...patch }
      : step
  ))
);

const computeCompletedStepCount = (steps = []) => steps.filter((step) => step.status === 'applied').length;

const findBundleMessage = ({ thread = null, bundleId = '' } = {}) => {
  const safeBundleId = clean(bundleId);
  const messages = Array.isArray(thread?.messages) ? [...thread.messages].reverse() : [];
  return messages.find((message) => clean(message?.proposalBundle?.bundleId) === safeBundleId) || null;
};

const sanitizeRelatedItem = (item = {}) => ({
  type: clean(item?.type),
  id: clean(item?.id),
  title: clean(item?.title),
  snippet: clean(item?.snippet)
});

const toPlainObject = (value) => {
  if (!value || typeof value !== 'object') return {};
  if (typeof value.toObject === 'function') return value.toObject({ getters: false, virtuals: false });
  return { ...value };
};

const inferOrganizationFolderName = (item = {}) => {
  const text = `${clean(item?.title)} ${clean(item?.snippet)}`.toLowerCase();
  if (/\b(shinkansen|rail|transport|train|mobility)\b/.test(text)) return 'Transportation';
  if (/\b(crypto|blockchain|exchange|hyperliquid|bitcoin|ethereum)\b/.test(text)) return 'Blockchain and Crypto';
  if (/\b(ai|artificial intelligence|startup|technology|innovation|model|gpt)\b/.test(text)) return 'Technology and Innovation';
  if (/\b(company|earnings|letter|ceo|executive|business|market|berkshire|update|news)\b/.test(text)) return 'Company News and Updates';
  if (/\b(personal|career|story|profile|memoir)\b/.test(text)) return 'Personal and Professional Updates';
  return 'Curated Research';
};

const resolveOrganizationDomain = (type = '') => {
  const safeType = clean(type).toLowerCase();
  if (['article', 'library'].includes(safeType)) return 'library';
  if (['notebook', 'note', 'notebook_entry'].includes(safeType)) return 'notebook';
  return '';
};

const buildGeneratedStructureOperations = ({ items = [] } = {}) => {
  const folderOpsByKey = new Map();
  const operations = [];
  const seenMoves = new Set();

  items.forEach((item) => {
    const id = clean(item?.id);
    const targetDomain = resolveOrganizationDomain(item?.type);
    if (!id || !targetDomain) return;

    const folderName = inferOrganizationFolderName(item);
    const folderKey = `${targetDomain}:${folderName.toLowerCase()}`;
    if (!folderOpsByKey.has(folderKey)) {
      const createOp = {
        opId: `create-${targetDomain}-${folderOpsByKey.size + 1}`,
        type: 'create_folder',
        targetDomain,
        status: 'approved',
        payload: { name: folderName },
        preview: { folderName },
        risk: 'low'
      };
      folderOpsByKey.set(folderKey, createOp);
      operations.push(createOp);
    }

    const moveKey = `${targetDomain}:${id}`;
    if (seenMoves.has(moveKey)) return;
    seenMoves.add(moveKey);
    operations.push({
      opId: `move-${targetDomain}-${seenMoves.size}`,
      type: 'move_item',
      targetDomain,
      status: 'approved',
      payload: {
        itemId: id,
        destinationFolderName: folderName
      },
      preview: {
        itemTitle: clean(item?.title) || id,
        destinationFolderName: folderName
      },
      risk: 'low'
    });
  });

  return operations;
};

const toPersistedStructureOperation = (operation = {}) => {
  const status = clean(operation?.status).toLowerCase();
  const preview = operation?.preview && typeof operation.preview === 'object' ? clone(operation.preview) : {};
  return {
    opId: clean(operation?.opId),
    type: clean(operation?.type).toLowerCase() || 'create_folder',
    targetDomain: clean(operation?.targetDomain).toLowerCase() || 'library',
    status: STRUCTURE_OPERATION_STATUS_VALUES.has(status) ? status : 'skipped',
    payload: operation?.payload && typeof operation.payload === 'object' ? clone(operation.payload) : {},
    preview: {
      ...preview,
      executionResult: {
        status: status || 'skipped',
        error: clean(operation?.error),
        executionIndex: Number.isFinite(Number(operation?.executionIndex)) ? Number(operation.executionIndex) : null
      }
    },
    risk: clean(operation?.risk).toLowerCase() === 'medium' ? 'medium' : 'low',
    undoPayload: operation?.undoPayload && typeof operation.undoPayload === 'object' ? clone(operation.undoPayload) : {}
  };
};

const findPendingStructureProposal = async ({
  AgentStructureProposal,
  userId = '',
  thread = null,
  run = {}
} = {}) => {
  if (!AgentStructureProposal || typeof AgentStructureProposal.findOne !== 'function') return null;
  const threadId = clean(thread?._id || run?.threadId);
  const sourceBundleId = clean(run?.sourceBundleId);
  if (!threadId && !sourceBundleId) return null;

  const query = {
    userId,
    status: 'pending'
  };
  if (threadId) query.sourceThreadId = threadId;
  if (sourceBundleId) query.sourceBundleId = sourceBundleId;

  return AgentStructureProposal.findOne(query);
};

const persistAppliedStructureProposal = async ({
  AgentStructureProposal,
  proposal = {},
  executed = {},
  userId = '',
  actor = {}
} = {}) => {
  const now = new Date();
  const acceptedBy = normalizeActor(actor || {}, 'user');
  const operations = Array.isArray(executed?.operations)
    ? executed.operations.map(toPersistedStructureOperation)
    : proposal.operations;
  if (proposal && typeof proposal.save === 'function') {
    proposal.status = clean(executed?.status).toLowerCase() || 'applied';
    proposal.acceptedBy = acceptedBy;
    proposal.acceptedAt = now;
    proposal.operations = operations;
    proposal.executionResult = executed?.executionResult || null;
    await proposal.save();
    return proposal;
  }

  if (AgentStructureProposal && typeof AgentStructureProposal.create === 'function') {
    return AgentStructureProposal.create({
      ...proposal,
      userId,
      status: clean(executed?.status).toLowerCase() || 'applied',
      acceptedBy,
      acceptedAt: now,
      operations,
      executionResult: executed?.executionResult || null
    });
  }

  return {
    ...proposal,
    status: clean(executed?.status).toLowerCase() || 'applied',
    acceptedBy,
    acceptedAt: now,
    operations,
    executionResult: executed?.executionResult || null
  };
};

const buildHandoffTitle = ({ step = {}, thread = null } = {}) => {
  const targetTitle = clean(step?.target?.title || thread?.scope?.title);
  if (targetTitle) return `${targetTitle}: routed handoff`;
  return clean(step?.title) || 'Routed handoff';
};

const executeAttachRelatedMaterialStep = ({
  step = {},
  thread = null,
  run = {}
} = {}) => {
  const bundleMessage = findBundleMessage({ thread, bundleId: run?.sourceBundleId });
  const items = Array.isArray(bundleMessage?.relatedItems)
    ? bundleMessage.relatedItems.map(sanitizeRelatedItem).filter((item) => item.title || item.id).slice(0, 12)
    : [];
  return {
    type: 'related_material',
    itemCount: items.length || Math.max(0, Number(step?.metadata?.itemCount) || 0),
    items
  };
};

const executeOrganizeWorkspaceStep = ({
  step = {},
  thread = null,
  run = {},
  userId = '',
  actor = {},
  AgentStructureProposal,
  Folder,
  Article,
  NotebookFolder,
  NotebookEntry
} = {}) => {
  const scope = thread?.scope && typeof thread.scope === 'object' ? thread.scope : {};
  const execute = async () => {
    const existingProposal = await findPendingStructureProposal({
      AgentStructureProposal,
      userId,
      thread,
      run
    });
    const bundleMessage = findBundleMessage({ thread, bundleId: run?.sourceBundleId });
    const relatedItems = Array.isArray(bundleMessage?.relatedItems)
      ? bundleMessage.relatedItems.map(sanitizeRelatedItem)
      : [];
    const generatedOperations = existingProposal
      ? []
      : buildGeneratedStructureOperations({ items: relatedItems });

    const proposal = existingProposal || {
      userId,
      sourceThreadId: clean(thread?._id || run?.threadId),
      sourceRunId: clean(run?.runId || run?._id),
      sourceBundleId: clean(run?.sourceBundleId),
      scope: clean(step?.metadata?.isImportScope) ? 'import_session' : 'workspace',
      scopeRef: clean(step?.metadata?.scopeId || scope?.id || step?.target?.id),
      title: clean(step?.title) || 'Clean up Library',
      summary: clean(step?.summary) || 'Apply the thread cleanup plan to the library structure.',
      rationale: 'The user explicitly approved execution from the thread.',
      operations: generatedOperations,
      createdBy: normalizeActor(actor || {}, 'user')
    };
    const plainProposal = toPlainObject(proposal);
    const operations = Array.isArray(plainProposal.operations) ? plainProposal.operations : [];
    if (operations.length === 0) {
      const error = new Error('No concrete folder moves were available to execute. Stage or edit a structure proposal with specific folders and items first.');
      error.status = 400;
      throw error;
    }

    const executed = await applyStructureProposal({
      models: {
        Folder,
        Article,
        NotebookFolder,
        NotebookEntry
      },
      proposal: plainProposal,
      userId
    });
    const result = executed?.executionResult || {};
    if (Number(result.appliedCount || 0) <= 0) {
      const error = new Error('The organization plan did not change any library or notebook items. Check that the proposed items still exist and try again.');
      error.status = 400;
      throw error;
    }
    const storedProposal = await persistAppliedStructureProposal({
      AgentStructureProposal,
      proposal,
      executed,
      userId,
      actor
    });
    return {
      type: 'organization_plan',
      status: clean(result.status || executed?.status) || 'applied',
      scopeType: clean(step?.metadata?.scopeType || scope?.type || step?.target?.type || 'workspace'),
      scopeId: clean(step?.metadata?.scopeId || scope?.id || step?.target?.id),
      sourceBundleId: clean(run?.sourceBundleId),
      structureProposalId: clean(storedProposal?._id || storedProposal?.structureProposalId),
      appliedCount: Number(result.appliedCount || 0),
      skippedCount: Number(result.skippedCount || 0),
      failedCount: Number(result.failedCount || 0),
      totalCount: Number(result.totalCount || operations.length),
      summary: clean(step?.summary) || 'Applied workspace organization work from the thread plan.'
    };
  };

  return execute();
};

const executeCreateHandoffStep = async ({
  step = {},
  thread = null,
  run = {},
  userId = '',
  actor = {},
  AgentHandoff,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc
} = {}) => {
  if (!AgentHandoff || typeof AgentHandoff.create !== 'function') {
    const error = new Error('Agent handoff model is not available.');
    error.status = 500;
    throw error;
  }
  if (typeof createThreadForHandoff !== 'function') {
    const error = new Error('Handoff thread creation is not available.');
    error.status = 500;
    throw error;
  }

  const bundleMessage = findBundleMessage({ thread, bundleId: run?.sourceBundleId });
  const createdBy = normalizeActor(actor || {}, 'user');
  const requestedActor = normalizeActor(step?.metadata?.requestedActor || {}, 'native_agent');
  const title = buildHandoffTitle({ step, thread });
  const objective = clean(bundleMessage?.text || step?.summary || step?.title) || title;
  const relatedItems = Array.isArray(bundleMessage?.relatedItems)
    ? bundleMessage.relatedItems.map(sanitizeRelatedItem).filter((item) => item.title || item.id).slice(0, 12)
    : [];

  const handoff = await AgentHandoff.create({
    userId,
    title,
    taskType: 'custom',
    objective,
    status: 'pending',
    priority: clean(step?.riskLevel).toLowerCase() === 'high' ? 'high' : 'normal',
    context: {
      sourceRunId: clean(run?.runId || run?._id),
      sourceThreadId: clean(thread?._id || run?.threadId),
      sourceBundleId: clean(run?.sourceBundleId),
      sourceOpId: clean(step?.opId),
      sourceContext: thread?.scope && typeof thread.scope === 'object' ? clone(thread.scope) : {},
      relatedItems
    },
    input: {},
    output: {},
    plan: typeof buildDefaultHandoffPlan === 'function'
      ? buildDefaultHandoffPlan({ taskType: 'custom', title, objective })
      : {},
    checkpoint: typeof buildDefaultHandoffCheckpoint === 'function'
      ? buildDefaultHandoffCheckpoint({ title, requestedActor })
      : {},
    requestedActor,
    createdBy,
    events: [{
      eventType: 'created',
      actor: createdBy,
      note: 'Created from agent run.',
      payload: {
        sourceRunId: clean(run?.runId || run?._id),
        sourceThreadId: clean(thread?._id || run?.threadId),
        sourceBundleId: clean(run?.sourceBundleId),
        sourceOpId: clean(step?.opId)
      }
    }]
  });

  const handoffThread = await createThreadForHandoff({
    userId,
    title,
    objective,
    taskType: 'custom',
    requestedActor,
    createdBy,
    handoffId: handoff._id
  });

  handoff.threadId = handoffThread?._id || null;
  if (typeof handoff.save === 'function') {
    await handoff.save();
  }

  const safeHandoff = typeof sanitizeAgentHandoffDoc === 'function'
    ? sanitizeAgentHandoffDoc(handoff)
    : {
        handoffId: clean(handoff?._id),
        title: clean(handoff?.title),
        status: clean(handoff?.status),
        threadId: clean(handoff?.threadId)
      };

  return {
    type: 'handoff',
    handoff: safeHandoff,
    path: clean(handoff?._id) ? `/think?tab=handoffs&handoffId=${handoff._id}` : '',
    threadId: clean(handoffThread?._id)
  };
};

const executeStepOperation = async ({
  step = {},
  thread = null,
  run = {},
  userId = '',
  actor = {},
  AgentHandoff,
  AgentStructureProposal,
  Folder,
  Article,
  NotebookFolder,
  NotebookEntry,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc
} = {}) => {
  const type = clean(step?.type).toLowerCase();
  if (type === 'attach_related_material') {
    return executeAttachRelatedMaterialStep({ step, thread, run });
  }
  if (type === 'organize_workspace') {
    return executeOrganizeWorkspaceStep({
      step,
      thread,
      run,
      userId,
      actor,
      AgentStructureProposal,
      Folder,
      Article,
      NotebookFolder,
      NotebookEntry
    });
  }
  if (type === 'create_handoff') {
    return executeCreateHandoffStep({
      step,
      thread,
      run,
      userId,
      actor,
      AgentHandoff,
      buildDefaultHandoffPlan,
      buildDefaultHandoffCheckpoint,
      createThreadForHandoff,
      sanitizeAgentHandoffDoc
    });
  }
  return null;
};

const executeAgentRun = async ({
  run = {},
  thread = null,
  userId = '',
  actor = {},
  approveBlockedStep = false,
  approvePendingApprovalSteps = false,
  requestStepApproval = null,
  AgentHandoff,
  AgentStructureProposal,
  Folder,
  Article,
  NotebookFolder,
  NotebookEntry,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc
} = {}) => {
  const safeRun = normalizeAgentRun(run);
  const now = new Date();
  let steps = safeRun.steps.map((step) => ({ ...step, metadata: step?.metadata && typeof step.metadata === 'object' ? { ...step.metadata } : {} }));
  let blockedStep = null;
  let currentOpId = '';

  if (!safeRun.startedAt) safeRun.startedAt = now;
  safeRun.lastActor = normalizeActor(actor || {}, safeRun.createdBy?.actorType || 'user');
  safeRun.status = 'in_progress';
  safeRun.pausedAt = null;
  safeRun.blockedOpId = '';

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.status === 'applied') continue;
    currentOpId = clean(step.opId);

    if (step.status === 'blocked' && !approveBlockedStep) {
      blockedStep = step;
      break;
    }

    const requiresApproval = Boolean(step.requiresApproval);
    const allowExplicitApproval = (approveBlockedStep && step.status === 'blocked')
      || (approvePendingApprovalSteps && step.status === 'pending');
    if (requiresApproval && !allowExplicitApproval) {
      let approval = null;
      if (typeof requestStepApproval === 'function') {
        approval = await requestStepApproval({
          run: safeRun,
          step,
          thread,
          userId,
          actor: safeRun.lastActor
        });
      }
      blockedStep = {
        ...step,
        status: 'blocked',
        blockedAt: step.blockedAt || now,
        metadata: approval
          ? {
              ...(step.metadata && typeof step.metadata === 'object' ? step.metadata : {}),
              approvalId: clean(approval?.approvalId),
              approval
            }
          : step.metadata
      };
      steps = updateStep(steps, step.opId, blockedStep);
      break;
    }

    try {
      const result = await executeStepOperation({
        step,
        thread,
        run: safeRun,
        userId,
        actor: safeRun.lastActor,
        AgentHandoff,
        AgentStructureProposal,
        Folder,
        Article,
        NotebookFolder,
        NotebookEntry,
        buildDefaultHandoffPlan,
        buildDefaultHandoffCheckpoint,
        createThreadForHandoff,
        sanitizeAgentHandoffDoc
      });

      steps = updateStep(steps, step.opId, {
        status: 'applied',
        appliedAt: now,
        blockedAt: null,
        metadata: result
          ? {
              ...(step.metadata && typeof step.metadata === 'object' ? step.metadata : {}),
              result
            }
          : step.metadata
      });
    } catch (error) {
      steps = updateStep(steps, step.opId, {
        status: 'failed',
        blockedAt: null,
        metadata: {
          ...(step.metadata && typeof step.metadata === 'object' ? step.metadata : {}),
          errorMessage: clean(error?.message) || 'Execution failed.'
        }
      });

      return normalizeAgentRun({
        ...safeRun,
        status: 'failed',
        currentOpId: clean(step.opId),
        blockedOpId: '',
        steps,
        completedStepCount: computeCompletedStepCount(steps),
        updatedAt: now
      });
    }
  }

  const completedStepCount = computeCompletedStepCount(steps);
  const allApplied = completedStepCount === steps.length && steps.length > 0;
  if (blockedStep) {
    return normalizeAgentRun({
      ...safeRun,
      status: 'paused_for_approval',
      currentOpId: clean(blockedStep.opId),
      blockedOpId: clean(blockedStep.opId),
      steps,
      completedStepCount,
      pausedAt: now,
      updatedAt: now
    });
  }

  return normalizeAgentRun({
    ...safeRun,
    status: allApplied ? 'completed' : 'in_progress',
    currentOpId: allApplied ? '' : currentOpId,
    blockedOpId: '',
    steps,
    completedStepCount,
    completedAt: allApplied ? now : safeRun.completedAt,
    updatedAt: now
  });
};

module.exports = {
  executeAgentRun
};
