const assert = require('assert');
const {
  buildProposalBundle,
  normalizeProposalBundle
} = require('../agentProposalBundles');

const run = () => {
  assert.strictEqual(
    buildProposalBundle({ context: { type: 'concept', id: 'concept-1', title: 'World Models' } }),
    null,
    'No staged change, no bundle.'
  );

  const rewriteBundle = buildProposalBundle({
    proposals: [{ change: 'rewrite', summary: 'Lead with the claim.', text: 'A world model predicts what happens next.' }],
    context: { type: 'concept', id: 'concept-1', title: 'World Models' },
    planner: { activeWorkerLabel: 'Editor' }
  });
  assert.strictEqual(rewriteBundle.status, 'pending', 'New bundles should start pending.');
  assert.strictEqual(rewriteBundle.operations.length, 1);
  assert.strictEqual(rewriteBundle.operations[0].type, 'propose_content_change');
  assert.strictEqual(rewriteBundle.operations[0].executionMode, 'proposed_change');
  assert.strictEqual(rewriteBundle.operations[0].summary, 'Lead with the claim.', 'The button says what the model said the change does.');
  assert.strictEqual(rewriteBundle.operations[0].metadata.proposedText, 'A world model predicts what happens next.');

  const organizeBundle = buildProposalBundle({
    proposals: [{ change: 'organize', summary: 'Group the loose notes.' }],
    context: { type: 'notebook', id: 'entry-1', title: 'Notebook' }
  });
  const organize = organizeBundle.operations[0];
  assert.strictEqual(organize.type, 'organize_workspace');
  assert.strictEqual(organize.executionMode, 'direct');
  assert.strictEqual(organize.riskLevel, 'medium');
  assert.strictEqual(organize.requiresApproval, true);
  assert.strictEqual(organize.title, 'Clean up Notebook');
  assert.strictEqual(organize.metadata.scopeType, 'notebook');
  assert.strictEqual(organize.metadata.scopeId, 'entry-1');

  const importBundle = buildProposalBundle({
    proposals: [{ change: 'organize', summary: 'File this import.' }],
    context: { type: 'import_session', id: 'session-1', title: 'Notion import' }
  });
  assert.strictEqual(importBundle.operations[0].title, 'Organize this import');
  assert.strictEqual(importBundle.operations[0].metadata.scopeType, 'import_session');
  assert.strictEqual(importBundle.operations[0].metadata.isImportScope, true);

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
