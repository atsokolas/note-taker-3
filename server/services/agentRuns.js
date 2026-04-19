const { normalizeProposalBundle } = require('./agentProposalBundles');

const clean = (value) => String(value || '').trim();

const RUN_STATUS_VALUES = new Set(['pending', 'in_progress', 'paused_for_approval', 'awaiting_review', 'completed', 'cancelled', 'failed']);
const STEP_STATUS_VALUES = new Set(['pending', 'in_progress', 'applied', 'blocked', 'dismissed', 'invalidated', 'failed']);

const clone = (value) => JSON.parse(JSON.stringify(value || null));

const normalizeActor = (input = {}, fallbackType = 'user') => ({
  actorType: clean(input?.actorType).toLowerCase() || fallbackType,
  actorId: clean(input?.actorId)
});

const normalizeRunStep = (input = {}, index = 0) => {
  const source = input && typeof input === 'object' ? input : {};
  const status = clean(source.status).toLowerCase();
  return {
    opId: clean(source.opId) || `op-${index + 1}`,
    type: clean(source.type).toLowerCase() || 'custom',
    title: clean(source.title) || `Operation ${index + 1}`,
    executionMode: clean(source.executionMode).toLowerCase() || 'direct',
    riskLevel: clean(source.riskLevel).toLowerCase() || 'low',
    requiresApproval: Boolean(source.requiresApproval),
    target: source.target && typeof source.target === 'object' ? source.target : {},
    metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
    status: STEP_STATUS_VALUES.has(status) ? status : 'pending',
    appliedAt: source.appliedAt ? new Date(source.appliedAt) : null,
    blockedAt: source.blockedAt ? new Date(source.blockedAt) : null
  };
};

const normalizeAgentRun = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const status = clean(source.status).toLowerCase();
  const steps = Array.isArray(source.steps)
    ? source.steps.map((step, index) => normalizeRunStep(step, index))
    : [];
  const blockedOpId = clean(source.blockedOpId);
  return {
    runId: clean(source.runId),
    threadId: clean(source.threadId),
    sourceBundleId: clean(source.sourceBundleId),
    title: clean(source.title),
    status: RUN_STATUS_VALUES.has(status) ? status : 'pending',
    createdBy: normalizeActor(source.createdBy || {}, 'user'),
    lastActor: source.lastActor ? normalizeActor(source.lastActor, 'user') : null,
    currentOpId: clean(source.currentOpId),
    blockedOpId,
    blockedStep: steps.find((step) => clean(step.opId) === blockedOpId) || null,
    steps,
    completedStepCount: Math.max(0, Number(source.completedStepCount) || 0),
    startedAt: source.startedAt ? new Date(source.startedAt) : null,
    pausedAt: source.pausedAt ? new Date(source.pausedAt) : null,
    completedAt: source.completedAt ? new Date(source.completedAt) : null,
    createdAt: source.createdAt ? new Date(source.createdAt) : new Date(),
    updatedAt: source.updatedAt ? new Date(source.updatedAt) : new Date()
  };
};

const sanitizeAgentRunDoc = (doc = {}) => {
  const safeRun = normalizeAgentRun(doc?.toObject ? doc.toObject({ getters: false, virtuals: false }) : doc);
  const blockedStep = safeRun.steps.find((step) => clean(step.opId) === clean(safeRun.blockedOpId)) || null;
  return {
    runId: safeRun.runId,
    threadId: safeRun.threadId,
    sourceBundleId: safeRun.sourceBundleId,
    title: safeRun.title,
    status: safeRun.status,
    createdBy: safeRun.createdBy,
    lastActor: safeRun.lastActor,
    currentOpId: safeRun.currentOpId,
    blockedOpId: safeRun.blockedOpId,
    blockedStep: blockedStep
      ? {
          ...blockedStep,
          appliedAt: blockedStep.appliedAt ? new Date(blockedStep.appliedAt).toISOString() : null,
          blockedAt: blockedStep.blockedAt ? new Date(blockedStep.blockedAt).toISOString() : null
        }
      : null,
    completedStepCount: safeRun.completedStepCount,
    steps: safeRun.steps.map((step) => ({
      ...step,
      appliedAt: step.appliedAt ? new Date(step.appliedAt).toISOString() : null,
      blockedAt: step.blockedAt ? new Date(step.blockedAt).toISOString() : null
    })),
    startedAt: safeRun.startedAt ? new Date(safeRun.startedAt).toISOString() : null,
    pausedAt: safeRun.pausedAt ? new Date(safeRun.pausedAt).toISOString() : null,
    completedAt: safeRun.completedAt ? new Date(safeRun.completedAt).toISOString() : null,
    createdAt: safeRun.createdAt ? new Date(safeRun.createdAt).toISOString() : null,
    updatedAt: safeRun.updatedAt ? new Date(safeRun.updatedAt).toISOString() : null
  };
};

const findProposalBundle = ({ thread = null, bundleId = '' } = {}) => {
  const safeBundleId = clean(bundleId);
  if (!thread || !safeBundleId) return null;
  const bundles = Array.isArray(thread.proposalBundles) ? thread.proposalBundles : [];
  return normalizeProposalBundle(bundles.find((bundle) => clean(bundle?.bundleId) === safeBundleId) || null);
};

const buildRunId = () => `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createRunFromProposalBundle = ({
  thread = null,
  bundleId = '',
  actor = {}
} = {}) => {
  const bundle = findProposalBundle({ thread, bundleId });
  if (!bundle) {
    const error = new Error('Proposal bundle not found.');
    error.status = 404;
    throw error;
  }

  return normalizeAgentRun({
    runId: buildRunId(),
    threadId: clean(thread?._id || thread?.threadId),
    sourceBundleId: bundle.bundleId,
    title: bundle.title,
    status: 'pending',
    createdBy: normalizeActor(actor || {}, 'user'),
    lastActor: normalizeActor(actor || {}, 'user'),
    currentOpId: bundle.operations[0]?.opId || '',
    blockedOpId: '',
    steps: bundle.operations.map((operation, index) => normalizeRunStep(operation, index)),
    completedStepCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  });
};

const shouldBlockStep = (step = {}, { allowApproval = false } = {}) => (
  Boolean(step.requiresApproval) && !allowApproval
);

const updateStep = (steps = [], opId = '', patch = {}) => (
  steps.map((step) => (
    clean(step.opId) === clean(opId)
      ? { ...step, ...patch }
      : step
  ))
);

const computeCompletedStepCount = (steps = []) => steps.filter((step) => step.status === 'applied').length;

const advanceAgentRun = ({
  run = {},
  actor = {},
  approveBlockedStep = false
} = {}) => {
  const safeRun = normalizeAgentRun(run);
  const now = new Date();
  let steps = safeRun.steps.map((step) => ({ ...step }));
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

    if (shouldBlockStep(step, { allowApproval: approveBlockedStep && step.status === 'blocked' })) {
      blockedStep = { ...step, status: 'blocked', blockedAt: step.blockedAt || now };
      steps = updateStep(steps, step.opId, blockedStep);
      break;
    }

    steps = updateStep(steps, step.opId, {
      status: 'applied',
      appliedAt: now,
      blockedAt: null
    });
  }

  const completedStepCount = computeCompletedStepCount(steps);
  const allApplied = completedStepCount === steps.length && steps.length > 0;
  const blockedStepSnapshot = blockedStep
    ? normalizeRunStep(steps.find((step) => clean(step.opId) === clean(blockedStep.opId)) || blockedStep)
    : null;

  if (blockedStep) {
    return normalizeAgentRun({
      ...safeRun,
      status: 'paused_for_approval',
      currentOpId: clean(blockedStep.opId),
      blockedOpId: clean(blockedStep.opId),
      steps,
      completedStepCount,
      blockedStep: blockedStepSnapshot,
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

const deriveBundleStatusFromRun = (run = {}) => {
  const safeRun = normalizeAgentRun(run);
  if (safeRun.status === 'completed') return 'applied';
  if (safeRun.completedStepCount > 0) return 'partially_applied';
  return 'pending';
};

const applyProposalBundleRunOutcome = ({
  thread = null,
  run = {}
} = {}) => {
  if (!thread) return thread;
  const bundleId = clean(run?.sourceBundleId);
  if (!bundleId) return thread;
  const nextStatus = deriveBundleStatusFromRun(run);

  const updateBundle = (bundle = null) => {
    const safeBundle = normalizeProposalBundle(bundle);
    if (!safeBundle || clean(safeBundle.bundleId) !== bundleId) return bundle;
    return {
      ...safeBundle,
      status: nextStatus
    };
  };

  if (Array.isArray(thread.proposalBundles)) {
    thread.proposalBundles = thread.proposalBundles.map(updateBundle);
  }
  if (Array.isArray(thread.messages)) {
    thread.messages = thread.messages.map((message) => {
      const safeMessage = message && typeof message === 'object' ? message : {};
      if (!safeMessage.proposalBundle) return safeMessage;
      return {
        ...safeMessage,
        proposalBundle: updateBundle(safeMessage.proposalBundle)
      };
    });
  }
  return thread;
};

module.exports = {
  normalizeAgentRun,
  sanitizeAgentRunDoc,
  createRunFromProposalBundle,
  advanceAgentRun,
  applyProposalBundleRunOutcome
};
