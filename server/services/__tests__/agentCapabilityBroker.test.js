const assert = require('assert');
const {
  resolveAgentCapability,
  brokerAgentTurn,
  isSharedQuestionContext
} = require('../agentCapabilityBroker');

const intent = (replyIntent, overrides = {}) => ({
  replyIntent,
  interactionMode: 'answer',
  retrievalPolicy: 'context',
  plannerPolicy: 'hidden',
  proposalPolicy: 'none',
  ...overrides
});

const run = () => {
  const answer = resolveAgentCapability({ intentDecision: intent('answer') });
  assert.strictEqual(answer.id, 'capability.context.answer');
  assert.strictEqual(answer.boundary, 'automatic');

  const retrieval = resolveAgentCapability({
    intentDecision: intent('retrieve', {
      interactionMode: 'retrieve',
      retrievalPolicy: 'workspace'
    })
  });
  assert.strictEqual(retrieval.id, 'capability.workspace.retrieve');
  assert.strictEqual(retrieval.effect, 'read');
  assert.strictEqual(retrieval.proposalPolicy, 'none');

  const blockedAttach = brokerAgentTurn({
    intentDecision: intent('retrieve', {
      interactionMode: 'act',
      retrievalPolicy: 'workspace',
      plannerPolicy: 'show',
      proposalPolicy: 'stage'
    }),
    message: 'Pull in evidence about pricing power.',
    context: { type: 'concept', id: 'concept-1', title: 'Pricing power' },
    relatedItems: []
  });
  assert.strictEqual(blockedAttach.capability.id, 'capability.material.attach');
  assert.strictEqual(blockedAttach.capability.availability, 'blocked');
  assert.strictEqual(blockedAttach.planner, null);
  assert.strictEqual(blockedAttach.proposalBundle, null);

  const stagedAttach = brokerAgentTurn({
    intentDecision: intent('retrieve', {
      interactionMode: 'act',
      retrievalPolicy: 'workspace',
      plannerPolicy: 'show',
      proposalPolicy: 'stage'
    }),
    message: 'Pull in evidence about pricing power.',
    context: { type: 'concept', id: 'concept-1', title: 'Pricing power' },
    relatedItems: [{ type: 'article', id: 'article-1', title: 'Pricing study' }]
  });
  assert.strictEqual(stagedAttach.capability.boundary, 'review_required');
  assert.ok(stagedAttach.planner);
  assert.ok(stagedAttach.proposalBundle);
  assert.strictEqual(stagedAttach.proposalBundle.operations[0].type, 'attach_related_material');

  const revision = brokerAgentTurn({
    intentDecision: intent('clarify', {
      interactionMode: 'act',
      plannerPolicy: 'show',
      proposalPolicy: 'stage'
    }),
    message: 'Rewrite this more clearly.',
    context: { type: 'concept', id: 'concept-1', title: 'Pricing power' }
  });
  assert.strictEqual(revision.capability.id, 'capability.content.revise');
  assert.strictEqual(revision.proposalBundle.operations[0].executionMode, 'proposed_change');

  const organization = brokerAgentTurn({
    intentDecision: intent('cleanup_structure', {
      interactionMode: 'act',
      retrievalPolicy: 'workspace',
      plannerPolicy: 'show',
      proposalPolicy: 'stage'
    }),
    message: 'Clean up the library.',
    context: { type: 'workspace', id: 'library', title: 'Library' }
  });
  assert.strictEqual(organization.capability.id, 'capability.workspace.organize');
  assert.strictEqual(organization.proposalBundle.operations[0].requiresApproval, true);

  const sharedOrganize = brokerAgentTurn({
    intentDecision: intent('cleanup_structure', {
      interactionMode: 'act',
      retrievalPolicy: 'workspace',
      plannerPolicy: 'show',
      proposalPolicy: 'stage'
    }),
    message: 'Organize my workspace',
    context: { type: 'shared_question', id: 'qslug', title: 'What survives compounding?' },
    contextItem: { type: 'shared_question', id: 'qslug', title: 'What survives compounding?' }
  });
  assert.strictEqual(sharedOrganize.capability.id, 'capability.context.answer');
  assert.strictEqual(sharedOrganize.capability.effect, 'read');
  assert.strictEqual(sharedOrganize.capability.proposalPolicy, 'none');
  assert.strictEqual(sharedOrganize.planner, null);
  assert.strictEqual(sharedOrganize.proposalBundle, null);
  assert.strictEqual(
    resolveAgentCapability({
      intentDecision: intent('cleanup_structure', { interactionMode: 'act', proposalPolicy: 'stage' }),
      context: { type: 'shared_question', id: 'qslug' }
    }).id,
    'capability.context.answer',
    'A published question must not resolve to workspace.organize.'
  );
  assert.strictEqual(isSharedQuestionContext({ type: 'shared_question' }), true);

  const passedOrganize = brokerAgentTurn({
    capability: organization.capability,
    intentDecision: intent('cleanup_structure', {
      interactionMode: 'act',
      proposalPolicy: 'stage'
    }),
    message: 'Organize my workspace',
    context: { type: 'shared_question', id: 'qslug' }
  });
  assert.strictEqual(passedOrganize.capability.id, 'capability.context.answer');
  assert.strictEqual(passedOrganize.proposalBundle, null, 'Brokering must clamp shared-question writes even if organize was already resolved.');

  const artifact = brokerAgentTurn({
    intentDecision: intent('summarize'),
    skillInvocation: { outputType: 'summary_brief' }
  });
  assert.strictEqual(artifact.capability.id, 'capability.artifact.draft');
  assert.strictEqual(artifact.capability.artifactPolicy, 'stage');
  assert.strictEqual(artifact.proposalBundle, null, 'Draft persistence is the review layer; it should not create a duplicate proposal bundle.');

  const integration = brokerAgentTurn({
    intentDecision: intent('chat'),
    skillInvocation: { outputType: 'integration_fetch' }
  });
  assert.strictEqual(integration.capability.id, 'capability.integration.import');
  assert.strictEqual(integration.capability.availability, 'blocked');
};

if (require.main === module) {
  try {
    run();
    console.log('agentCapabilityBroker tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
