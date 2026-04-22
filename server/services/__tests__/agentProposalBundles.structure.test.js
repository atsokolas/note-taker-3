const assert = require('assert');
const { buildProposalBundle } = require('../agentProposalBundles');

const run = () => {
  const notebookBundle = buildProposalBundle({
    intent: 'organize',
    context: {
      type: 'notebook',
      id: 'entry-1',
      title: 'Notebook'
    }
  });

  assert.ok(notebookBundle, 'Expected an organization bundle for organize intent.');
  assert.strictEqual(notebookBundle.operations.length, 1, 'Organization bundles should stage one structural operation.');
  assert.strictEqual(notebookBundle.operations[0].type, 'organize_workspace');
  assert.strictEqual(notebookBundle.operations[0].executionMode, 'direct');
  assert.strictEqual(notebookBundle.operations[0].riskLevel, 'medium');
  assert.strictEqual(notebookBundle.operations[0].requiresApproval, true);
  assert.strictEqual(notebookBundle.operations[0].metadata.scopeType, 'notebook');
  assert.strictEqual(notebookBundle.operations[0].metadata.scopeId, 'entry-1');

  const importBundle = buildProposalBundle({
    intent: 'organize_import',
    context: {
      type: 'import_session',
      id: 'session-1',
      title: 'Notion import'
    }
  });

  assert.ok(importBundle, 'Expected an organization bundle for organize_import intent.');
  assert.strictEqual(importBundle.operations[0].title, 'Organize this import');
  assert.strictEqual(importBundle.operations[0].metadata.scopeType, 'import_session');
  assert.strictEqual(importBundle.operations[0].metadata.scopeId, 'session-1');
  assert.strictEqual(importBundle.operations[0].metadata.isImportScope, true);

  const cleanupBundle = buildProposalBundle({
    intent: 'cleanup_structure',
    context: {
      type: 'workspace',
      id: 'library',
      title: 'Library'
    }
  });

  assert.ok(cleanupBundle, 'Expected an organization bundle for cleanup_structure intent.');
  assert.strictEqual(cleanupBundle.operations[0].type, 'organize_workspace');
  assert.strictEqual(cleanupBundle.operations[0].title, 'Clean up Library');
};

if (require.main === module) {
  try {
    run();
    console.log('agentProposalBundles.structure tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
