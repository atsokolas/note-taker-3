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
  retrieve: Object.freeze({
    id: 'capability.workspace.retrieve',
    label: 'Search workspace',
    effect: 'read',
    boundary: 'automatic'
  }),
  plan: Object.freeze({
    id: 'capability.plan.compose',
    label: 'Compose a plan',
    effect: 'reason',
    boundary: 'automatic'
  }),
  attach: Object.freeze({
    id: 'capability.material.attach',
    label: 'Attach related material',
    effect: 'write',
    boundary: 'review_required'
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
  }),
  clarify: Object.freeze({
    id: 'capability.request.clarify',
    label: 'Clarify the request',
    effect: 'none',
    boundary: 'not_applicable'
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

const resolveAgentCapability = ({
  intentDecision = {},
  skillInvocation = {},
  relatedItems = []
} = {}) => {
  const outputType = clean(skillInvocation?.outputType).toLowerCase();
  const artifactType = artifactTypeFromOutputType(outputType);
  const intent = clean(intentDecision?.replyIntent).toLowerCase();
  const interactionMode = clean(intentDecision?.interactionMode).toLowerCase();
  const relatedCount = Array.isArray(relatedItems) ? relatedItems.length : 0;

  if (outputType === 'integration_fetch') {
    return capabilityDecision(CAPABILITIES.integration, {
      availability: 'blocked',
      reason: 'Imports need a dedicated reviewable import flow before they can run from chat.'
    });
  }

  if (artifactType) {
    return capabilityDecision(CAPABILITIES.artifact, {
      plannerPolicy: intentDecision?.plannerPolicy === 'show' ? 'show' : 'hidden',
      artifactPolicy: 'stage'
    });
  }

  if (interactionMode === 'clarify' || intent === 'clarify_request') {
    return capabilityDecision(CAPABILITIES.clarify);
  }

  if (intent === 'cleanup_structure') {
    return capabilityDecision(CAPABILITIES.organize, {
      plannerPolicy: 'show',
      proposalPolicy: 'stage'
    });
  }

  if (['clarify', 'strengthen', 'restructure'].includes(intent) && interactionMode === 'act') {
    return capabilityDecision(CAPABILITIES.revise, {
      plannerPolicy: 'show',
      proposalPolicy: 'stage'
    });
  }

  if (intent === 'retrieve' && interactionMode === 'act') {
    if (relatedCount === 0) {
      return capabilityDecision(CAPABILITIES.attach, {
        availability: 'blocked',
        reason: 'No matching workspace material was found to stage.'
      });
    }
    return capabilityDecision(CAPABILITIES.attach, {
      plannerPolicy: 'show',
      proposalPolicy: 'stage'
    });
  }

  if (interactionMode === 'plan' || intent === 'plan') {
    return capabilityDecision(CAPABILITIES.plan, { plannerPolicy: 'show' });
  }

  if (intent === 'retrieve' || intentDecision?.retrievalPolicy === 'workspace') {
    return capabilityDecision(CAPABILITIES.retrieve);
  }

  return capabilityDecision(CAPABILITIES.answer);
};

const brokerAgentTurn = ({
  capability: resolvedCapability = null,
  intentDecision = {},
  message = '',
  context = {},
  contextItem = null,
  relatedItems = [],
  skillInvocation = {}
} = {}) => {
  let capability = resolvedCapability && typeof resolvedCapability === 'object'
    ? { ...resolvedCapability }
    : resolveAgentCapability({ intentDecision, skillInvocation, relatedItems });

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
    ? buildProposalBundle({
        intent: intentDecision?.replyIntent,
        context,
        contextItem,
        relatedItems,
        skillInvocation,
        planner
      })
    : null;

  if (capability.proposalPolicy === 'stage' && !proposalBundle) {
    capability = {
      ...capability,
      availability: 'blocked',
      reason: 'No valid reviewable operation could be built for this context.'
    };
    return { capability, planner: null, proposalBundle: null };
  }

  return { capability, planner, proposalBundle };
};

module.exports = {
  CAPABILITIES,
  resolveAgentCapability,
  brokerAgentTurn
};
