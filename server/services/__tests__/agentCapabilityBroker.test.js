const assert = require('assert');
const {
  resolveAgentCapability,
  brokerAgentTurn,
  isSharedQuestionContext
} = require('../agentCapabilityBroker');

const concept = { type: 'concept', id: 'concept-1', title: 'Pricing power' };

const run = () => {
  const answer = resolveAgentCapability({ context: concept });
  assert.strictEqual(answer.id, 'capability.context.answer');
  assert.strictEqual(answer.boundary, 'automatic');

  // Nothing is staged unless the model staged it: the wording of the message
  // decides nothing.
  const plain = brokerAgentTurn({ message: 'Rewrite this more clearly.', context: concept });
  assert.strictEqual(plain.capability.id, 'capability.context.answer');
  assert.strictEqual(plain.proposalBundle, null);
  assert.strictEqual(plain.planner, null);

  const revision = brokerAgentTurn({
    proposals: [{ change: 'rewrite', summary: 'Tighten the definition.', text: 'Pricing power is the ability to raise prices without losing customers.' }],
    message: 'Rewrite this more clearly.',
    context: concept
  });
  assert.strictEqual(revision.capability.id, 'capability.content.revise');
  assert.strictEqual(revision.capability.boundary, 'review_required');
  assert.ok(revision.planner);
  assert.strictEqual(revision.proposalBundle.operations[0].executionMode, 'proposed_change');
  assert.strictEqual(revision.proposalBundle.operations[0].metadata.proposedText, 'Pricing power is the ability to raise prices without losing customers.');

  const organization = brokerAgentTurn({
    proposals: [{ change: 'organize', summary: 'Sort the loose sources into folders.' }],
    message: 'Clean up the library.',
    context: { type: 'workspace', id: 'library', title: 'Library' }
  });
  assert.strictEqual(organization.capability.id, 'capability.workspace.organize');
  assert.strictEqual(organization.proposalBundle.operations[0].requiresApproval, true);

  const sharedOrganize = brokerAgentTurn({
    proposals: [{ change: 'organize', summary: 'Sort the workspace.' }],
    message: 'Organize my workspace',
    context: { type: 'shared_question', id: 'qslug', title: 'What survives compounding?' },
    contextItem: { type: 'shared_question', id: 'qslug', title: 'What survives compounding?' }
  });
  assert.strictEqual(sharedOrganize.capability.id, 'capability.context.answer');
  assert.strictEqual(sharedOrganize.capability.effect, 'read');
  assert.strictEqual(sharedOrganize.planner, null);
  assert.strictEqual(sharedOrganize.proposalBundle, null, 'A published question never stages a workspace write.');
  assert.strictEqual(isSharedQuestionContext({ type: 'shared_question' }), true);

  const artifact = brokerAgentTurn({ skillInvocation: { outputType: 'summary_brief' } });
  assert.strictEqual(artifact.capability.id, 'capability.artifact.draft');
  assert.strictEqual(artifact.capability.artifactPolicy, 'stage');
  assert.strictEqual(artifact.proposalBundle, null, 'Draft persistence is the review layer; it should not create a duplicate proposal bundle.');

  const integration = brokerAgentTurn({ skillInvocation: { outputType: 'integration_fetch' } });
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
