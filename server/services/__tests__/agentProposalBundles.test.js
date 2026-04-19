const assert = require('assert');
const {
  buildProposalBundle,
  normalizeProposalBundle
} = require('../agentProposalBundles');

const run = () => {
  const rewriteBundle = buildProposalBundle({
    intent: 'clarify',
    context: {
      type: 'concept',
      id: 'concept-1',
      title: 'World Models'
    },
    relatedItems: [
      { type: 'article', id: 'a1', title: 'Ground truth checks' },
      { type: 'notebook', id: 'n1', title: 'Model drift notes' }
    ],
    planner: {
      activeWorkerLabel: 'Editor'
    }
  });

  assert.ok(rewriteBundle, 'Expected a proposal bundle for a clarify pass.');
  assert.strictEqual(rewriteBundle.status, 'pending', 'New bundles should start pending.');
  assert.strictEqual(rewriteBundle.operations.length, 2, 'Clarify bundles with related items should preserve both content and material operations.');
  assert.strictEqual(
    rewriteBundle.operations[0].executionMode,
    'proposed_change',
    'Content rewrites should be marked as proposed changes.'
  );
  assert.strictEqual(
    rewriteBundle.operations[1].type,
    'attach_related_material',
    'Related material collection should remain a direct operation in the same bundle.'
  );

  const handoffBundle = buildProposalBundle({
    intent: 'chat',
    context: {
      type: 'workspace',
      id: 'think',
      title: 'Think'
    },
    skillInvocation: {
      outputType: 'handoff_draft'
    },
    planner: {
      activeWorkerLabel: 'Planner'
    }
  });
  assert.ok(handoffBundle, 'Handoff draft output should produce a proposal bundle.');
  assert.ok(
    handoffBundle.operations.some((operation) => operation.type === 'create_handoff'),
    'Handoff bundles should include a create_handoff operation.'
  );

  const normalized = normalizeProposalBundle({
    bundleId: 'bundle-fixed',
    title: 'Rewrite World Models',
    operations: [
      {
        opId: 'content',
        type: 'propose_content_change',
        title: 'Rewrite World Models',
        executionMode: 'proposed_change',
        riskLevel: 'low',
        target: { type: 'concept', id: 'concept-1', title: 'World Models' }
      }
    ]
  });
  assert.strictEqual(normalized.bundleId, 'bundle-fixed', 'Bundle ids should be preserved during normalization.');
  assert.strictEqual(normalized.operations[0].status, 'pending', 'Operation status should default to pending.');
};

if (require.main === module) {
  try {
    run();
    console.log('agentProposalBundles tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
