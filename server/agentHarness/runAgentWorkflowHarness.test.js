const assert = require('assert');
const fs = require('fs');

const { WORKFLOW_SPECS, getAvailableFixtureSets, runAgentWorkflowHarness } = require('./runAgentWorkflowHarness');

const run = async () => {
  assert.strictEqual(WORKFLOW_SPECS.length, 10, 'Harness should cover the ten canonical workflows.');
  assert.deepStrictEqual(getAvailableFixtureSets(), ['synthetic', 'realistic']);
  const result = await runAgentWorkflowHarness({
    mode: 'mock',
    outputDir: 'tmp/agent-harness-test-runs',
    integrationDryRun: true,
    workflowIds: ['librarian', 'memory_steward']
  });
  assert.strictEqual(result.summary.total, 2, 'Scoped mock harness should run selected workflow specs.');
  assert.strictEqual(result.summary.failed, 0, 'Mock harness fixtures should satisfy their contracts.');
  assert.ok(fs.existsSync(result.filePath), 'Harness should write a dated result artifact.');
  assert.ok(fs.existsSync(result.markdownPath), 'Harness should write a readable markdown summary.');
  const librarian = result.results.find((row) => row.id === 'librarian');
  const memorySteward = result.results.find((row) => row.id === 'memory_steward');
  assert.strictEqual(librarian.serviceDraft.type, 'AgentStructureProposal');
  assert.strictEqual(librarian.serviceDraft.payload.operations[0].type, 'create_folder');
  assert.strictEqual(memorySteward.serviceDraft.type, 'WorkingMemoryItem[]');
  assert.strictEqual(memorySteward.serviceDraft.payloads.length, 3);

  const realisticResult = await runAgentWorkflowHarness({
    mode: 'mock',
    fixtureSet: 'realistic',
    outputDir: 'tmp/agent-harness-test-runs',
    integrationDryRun: true,
    workflowIds: ['thought_partner', 'librarian', 'memory_steward']
  });
  assert.strictEqual(realisticResult.fixtureSet, 'realistic');
  assert.strictEqual(realisticResult.summary.fixtureSet, 'realistic');
  assert.strictEqual(realisticResult.summary.failed, 0, 'Realistic mock fixtures should satisfy their contracts.');
  assert.ok(realisticResult.results.every((row) => row.fixtureSet === 'realistic'));
  assert.ok(
    realisticResult.results.find((row) => row.id === 'thought_partner').output.includes('trust'),
    'Realistic fixture set should use the more workspace-specific thought-partner case.'
  );

  const controlledRows = [];
  const controlledResult = await runAgentWorkflowHarness({
    mode: 'mock',
    fixtureSet: 'realistic',
    outputDir: 'tmp/agent-harness-test-runs',
    workflowIds: ['librarian', 'memory_steward'],
    controlledWriteMode: 'stage',
    writeApproved: true,
    serviceModels: {
      AgentStructureProposal: {
        async create(payload) {
          controlledRows.push(payload);
          return { _id: 'controlled-proposal-1', ...payload };
        }
      }
    }
  });
  assert.strictEqual(controlledResult.summary.failed, 0);
  assert.strictEqual(controlledResult.summary.controlledWrites.total, 2);
  assert.strictEqual(controlledResult.summary.controlledWrites.written, 1);
  assert.strictEqual(controlledResult.summary.controlledWrites.skipped, 1);
  assert.strictEqual(controlledRows.length, 1, 'Stage mode should only create a pending structure proposal.');
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agent workflow harness tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
