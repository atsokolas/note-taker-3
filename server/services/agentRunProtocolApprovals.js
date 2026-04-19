const clean = (value) => String(value || '').trim();

const normalizeActor = (input = {}, fallbackType = 'user') => ({
  actorType: clean(input?.actorType).toLowerCase() || fallbackType,
  actorId: clean(input?.actorId)
});

const sanitizeRunProtocolApproval = (approval = {}) => ({
  approvalId: clean(approval?._id || approval?.approvalId),
  status: clean(approval?.status) || 'pending',
  scope: clean(approval?.scope) || 'agent_ops',
  op: clean(approval?.op),
  payload: approval?.payload && typeof approval.payload === 'object' ? approval.payload : {},
  preview: approval?.preview && typeof approval.preview === 'object' ? approval.preview : {},
  reason: clean(approval?.reason),
  requestedBy: normalizeActor(approval?.requestedBy || {}, 'native_agent')
});

const requestRunStepApproval = async ({
  AgentProtocolApproval,
  userId = '',
  run = {},
  step = {},
  actor = {}
} = {}) => {
  if (!AgentProtocolApproval || typeof AgentProtocolApproval.create !== 'function') return null;

  const approval = await AgentProtocolApproval.create({
    userId,
    status: 'pending',
    scope: 'agent_ops',
    op: 'runs.resume',
    payload: {
      runId: clean(run?.runId || run?._id),
      threadId: clean(run?.threadId),
      blockedOpId: clean(step?.opId),
      approveBlockedStep: true
    },
    preview: {
      title: clean(step?.title || run?.title || 'Run approval'),
      threadId: clean(run?.threadId),
      runId: clean(run?.runId || run?._id),
      opId: clean(step?.opId)
    },
    reason: clean(step?.title)
      ? `${step.title} requires approval before the run can continue.`
      : 'Run step requires approval before the run can continue.',
    requestedBy: normalizeActor(actor || {}, 'native_agent')
  });

  return sanitizeRunProtocolApproval(approval);
};

module.exports = {
  requestRunStepApproval,
  sanitizeRunProtocolApproval
};
