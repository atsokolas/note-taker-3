const { artifactTypeFromOutputType } = require('./agentArtifactDrafts');
const { buildProposalBundle } = require('./agentProposalBundles');
const { buildAgentPlanner } = require('./agentWorkerRoles');

const clean = (value) => String(value || '').trim();

const CAPABILITIES = Object.freeze({
  answer: Object.freeze({
    id: 'capability.context.answer',
    label: 'Answer from context',
    effect: 'read',
    boundary: 'automatic'
  }),
  revise: Object.freeze({
    id: 'capability.content.revise',
    label: 'Revise content',
    effect: 'write',
    boundary: 'review_required'
  }),
  organize: Object.freeze({
    id: 'capability.workspace.organize',
    label: 'Organize workspace',
    effect: 'write',
    boundary: 'review_required'
  }),
  artifact: Object.freeze({
    id: 'capability.artifact.draft',
    label: 'Stage an artifact draft',
    effect: 'draft',
    boundary: 'review_required'
  }),
  integration: Object.freeze({
    id: 'capability.integration.import',
    label: 'Import external material',
    effect: 'write',
    boundary: 'review_required'
  })
});

const capabilityDecision = (capability, overrides = {}) => ({
  ...capability,
  availability: 'available',
  plannerPolicy: 'hidden',
  proposalPolicy: 'none',
  artifactPolicy: 'none',
  reason: '',
  ...overrides
});

const isSharedQuestionContext = (context = {}, contextItem = null) => (
  clean(contextItem?.type || context?.type).toLowerCase() === 'shared_question'
);

const sharedQuestionReadCapability = () => capabilityDecision(CAPABILITIES.answer, {
  reason: 'This conversation is bound to the published question. Workspace writes stay out of scope.'
});

// What this turn may do, decided from what the reader invoked and what the
// model staged, never from the wording of the message.
const resolveAgentCapability = ({
  proposals = [],
  skillInvocation = {},
  context = {},
  contextItem = null
} = {}) => {
  if (isSharedQuestionContext(context, contextItem)) {
    return sharedQuestionReadCapability();
  }
  const outputType = clean(skillInvocation?.outputType).toLowerCase();
  const staged = new Set((Array.isArray(proposals) ? proposals : []).map(proposal => proposal?.change));

  if (outputType === 'integration_fetch') {
    return capabilityDecision(CAPABILITIES.integration, {
      availability: 'blocked',
      reason: 'Imports need a dedicated reviewable import flow before they can run from chat.'
    });
  }
  if (artifactTypeFromOutputType(outputType)) {
    return capabilityDecision(CAPABILITIES.artifact, { artifactPolicy: 'stage' });
  }
  if (staged.has('organize')) {
    return capabilityDecision(CAPABILITIES.organize, { plannerPolicy: 'show', proposalPolicy: 'stage' });
  }
  if (staged.has('rewrite')) {
    return capabilityDecision(CAPABILITIES.revise, { plannerPolicy: 'show', proposalPolicy: 'stage' });
  }
  return capabilityDecision(CAPABILITIES.answer);
};

const brokerAgentTurn = ({
  proposals = [],
  message = '',
  context = {},
  contextItem = null,
  skillInvocation = {}
} = {}) => {
  const capability = resolveAgentCapability({ proposals, skillInvocation, context, contextItem });
  if (capability.availability === 'blocked') {
    return { capability, planner: null, proposalBundle: null };
  }

  const planner = capability.plannerPolicy === 'show'
    ? buildAgentPlanner({
        taskType: context?.metadata?.taskType || 'custom',
        skillInvocation,
        message
      })
    : null;
  const proposalBundle = capability.proposalPolicy === 'stage'
    ? buildProposalBundle({ proposals, context, contextItem, planner })
    : null;

  return { capability, planner, proposalBundle };
};

module.exports = {
  CAPABILITIES,
  resolveAgentCapability,
  brokerAgentTurn,
  isSharedQuestionContext,
  sharedQuestionReadCapability
};
