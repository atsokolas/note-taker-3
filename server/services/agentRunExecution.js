const { normalizeAgentRun } = require('./agentRuns');

const clean = (value) => String(value || '').trim();

const clone = (value) => JSON.parse(JSON.stringify(value || null));

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
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc
} = {}) => {
  const type = clean(step?.type).toLowerCase();
  if (type === 'attach_related_material') {
    return executeAttachRelatedMaterialStep({ step, thread, run });
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
  requestStepApproval = null,
  AgentHandoff,
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
    const allowBlockedApproval = approveBlockedStep && step.status === 'blocked';
    if (requiresApproval && !allowBlockedApproval) {
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
