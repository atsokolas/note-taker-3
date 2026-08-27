const assert = require('assert');
const {
  resolveAgentCapability,
  brokerAgentTurn
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
