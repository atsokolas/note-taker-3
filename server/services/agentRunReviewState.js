const { normalizeAgentRun } = require('./agentRuns');

const clean = (value) => String(value || '').trim();

const TERMINAL_STEP_STATUSES = new Set(['applied', 'dismissed', 'invalidated']);
const ACTIVE_STEP_STATUSES = new Set(['pending', 'in_progress', 'blocked']);
const PENDING_REVIEW_STATUSES = new Set(['pending']);

const deriveRunLifecycleState = ({
  run = {},
  proposedChanges = []
} = {}) => {
  const safeRun = normalizeAgentRun(run);
  if (['failed', 'cancelled'].includes(clean(safeRun.status).toLowerCase())) {
    return clean(safeRun.status).toLowerCase();
  }

  const steps = Array.isArray(safeRun.steps) ? safeRun.steps : [];
  const blockedStep = steps.find((step) => clean(step?.status).toLowerCase() === 'blocked');
  if (blockedStep) return 'paused_for_approval';

  const pendingReviewCount = (Array.isArray(proposedChanges) ? proposedChanges : [])
    .filter((change) => PENDING_REVIEW_STATUSES.has(clean(change?.status).toLowerCase()))
    .length;
  if (pendingReviewCount > 0) return 'awaiting_review';

  const hasSteps = steps.length > 0;
  const hasActiveExecution = steps.some((step) => ACTIVE_STEP_STATUSES.has(clean(step?.status).toLowerCase()));
  if (hasActiveExecution) {
    const hasStarted = steps.some((step) => TERMINAL_STEP_STATUSES.has(clean(step?.status).toLowerCase()));
    return hasStarted ? 'in_progress' : 'pending';
  }

  const allResolved = hasSteps && steps.every((step) => TERMINAL_STEP_STATUSES.has(clean(step?.status).toLowerCase()));
  if (allResolved) return 'completed';

  return safeRun.startedAt ? 'in_progress' : 'pending';
};

const dismissBlockedRunStep = ({
  run = {},
  approvalId = ''
} = {}) => {
  const safeRun = normalizeAgentRun(run);
  const safeApprovalId = clean(approvalId);
  const steps = safeRun.steps.map((step) => {
    const stepApprovalId = clean(step?.metadata?.approvalId);
    const matchesApproval = safeApprovalId && stepApprovalId === safeApprovalId;
    const isBlockedStep = clean(step?.opId) === clean(safeRun.blockedOpId) || clean(step?.status).toLowerCase() === 'blocked';
    if (!matchesApproval && !isBlockedStep) return step;
    return {
      ...step,
      status: 'dismissed',
      blockedAt: null,
      metadata: {
        ...(step?.metadata && typeof step.metadata === 'object' ? step.metadata : {}),
        approvalDecision: 'rejected'
      }
    };
  });

  return normalizeAgentRun({
    ...safeRun,
    status: 'in_progress',
    currentOpId: '',
    blockedOpId: '',
    blockedStep: null,
    pausedAt: null,
    steps,
    completedStepCount: steps.filter((step) => clean(step?.status).toLowerCase() === 'applied').length
  });
};

const reconcileAgentRunState = async ({
  AgentRun,
  AgentProposedChange,
  userId = '',
  runId = '',
  runOverride = null
} = {}) => {
  if (!AgentRun) return null;
  const runDoc = runOverride || await AgentRun.findOne({
    _id: clean(runId),
    userId
  });
  if (!runDoc) return null;

  const safeRunId = clean(runDoc?._id || runOverride?.runId || runOverride?._id);
  const proposedChanges = AgentProposedChange && typeof AgentProposedChange.find === 'function'
    ? await AgentProposedChange.find({
        userId,
        sourceRunId: safeRunId
      })
    : [];

  const nextStatus = deriveRunLifecycleState({
    run: runDoc,
    proposedChanges
  });

  if (typeof runDoc.save === 'function') {
    runDoc.status = nextStatus;
    if (nextStatus !== 'paused_for_approval') {
      runDoc.blockedOpId = '';
      runDoc.pausedAt = null;
    }
    if (nextStatus === 'completed' && !runDoc.completedAt) {
      runDoc.completedAt = new Date();
    }
    if (nextStatus !== 'completed') {
      runDoc.completedAt = null;
    }
    await runDoc.save();
    return runDoc;
  }

  return {
    ...runDoc,
    status: nextStatus
  };
};

module.exports = {
  deriveRunLifecycleState,
  dismissBlockedRunStep,
  reconcileAgentRunState
};
