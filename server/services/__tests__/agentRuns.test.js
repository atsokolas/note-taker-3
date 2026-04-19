const assert = require('assert');
const {
  createRunFromProposalBundle,
  advanceAgentRun,
  applyProposalBundleRunOutcome
} = require('../agentRuns');

const buildThread = () => ({
  proposalBundles: [
    {
      bundleId: 'bundle-1',
      title: 'Strengthen World Models + 1 more',
      status: 'pending',
      operations: [
        {
          opId: 'content-change',
          type: 'propose_content_change',
          title: 'Strengthen World Models',
          executionMode: 'proposed_change',
          riskLevel: 'low',
          requiresApproval: false
        },
        {
          opId: 'delete-material',
          type: 'delete_attached_material',
          title: 'Remove weak source',
          executionMode: 'direct',
          riskLevel: 'high',
          requiresApproval: true
        }
      ]
    }
  ],
  messages: [
    {
      role: 'assistant',
      text: 'I can strengthen this concept and remove the weakest source.',
      proposalBundle: {
        bundleId: 'bundle-1',
        title: 'Strengthen World Models + 1 more',
        status: 'pending',
        operations: [
          {
            opId: 'content-change',
            type: 'propose_content_change',
            title: 'Strengthen World Models',
            executionMode: 'proposed_change',
            riskLevel: 'low',
            requiresApproval: false
          },
          {
            opId: 'delete-material',
            type: 'delete_attached_material',
            title: 'Remove weak source',
            executionMode: 'direct',
            riskLevel: 'high',
            requiresApproval: true
          }
        ]
      }
    }
  ]
});

const run = () => {
  const thread = buildThread();
  const created = createRunFromProposalBundle({
    thread,
    bundleId: 'bundle-1',
    actor: { actorType: 'user', actorId: 'u1' }
  });

  assert.strictEqual(created.status, 'pending', 'New runs should start pending.');
  assert.strictEqual(created.steps.length, 2, 'Run should snapshot bundle operations into steps.');

  const firstAdvance = advanceAgentRun({
    run: created,
    actor: { actorType: 'user', actorId: 'u1' }
  });
  assert.strictEqual(firstAdvance.status, 'paused_for_approval', 'Run should pause on the first risky blocked step.');
  assert.strictEqual(firstAdvance.completedStepCount, 1, 'Safe steps before the risky step should be applied.');
  assert.strictEqual(firstAdvance.blockedStep?.opId, 'delete-material', 'Blocked step should point at the risky operation.');
  assert.strictEqual(firstAdvance.steps[0].status, 'applied', 'Safe step should be marked applied.');
  assert.strictEqual(firstAdvance.steps[1].status, 'blocked', 'Risky step should be marked blocked.');

  applyProposalBundleRunOutcome({ thread, run: firstAdvance });
  assert.strictEqual(thread.proposalBundles[0].status, 'partially_applied', 'Thread bundle should reflect partial execution.');
  assert.strictEqual(thread.messages[0].proposalBundle.status, 'partially_applied', 'Assistant message bundle should also reflect partial execution.');

  const resumed = advanceAgentRun({
    run: firstAdvance,
    actor: { actorType: 'user', actorId: 'u1' },
    approveBlockedStep: true
  });
  assert.strictEqual(resumed.status, 'completed', 'Approving the blocked step should complete the run.');
  assert.strictEqual(resumed.completedStepCount, 2, 'All steps should be applied after approval.');
  assert.strictEqual(resumed.steps[1].status, 'applied', 'Blocked step should move to applied after approval.');

  applyProposalBundleRunOutcome({ thread, run: resumed });
  assert.strictEqual(thread.proposalBundles[0].status, 'applied', 'Thread bundle should resolve to applied after run completion.');
  assert.strictEqual(thread.messages[0].proposalBundle.status, 'applied', 'Assistant bundle snapshot should also resolve to applied.');
};

if (require.main === module) {
  try {
    run();
    console.log('agentRuns tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
