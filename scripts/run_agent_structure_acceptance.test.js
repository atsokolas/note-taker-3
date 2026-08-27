const assert = require('assert');

const {
  TARGET_FOLDER_NAME,
  assertDisposableDatabaseUri,
  databaseNameFromUri,
  exactPlanForFixture,
  parseArgs
} = require('./run_agent_structure_acceptance');

const run = async () => {
  const safeUri = 'mongodb://127.0.0.1:27017/noeis_agent_structure_acceptance_test';
  assert.strictEqual(databaseNameFromUri(safeUri), 'noeis_agent_structure_acceptance_test');
  assert.strictEqual(assertDisposableDatabaseUri(safeUri), 'noeis_agent_structure_acceptance_test');
  assert.throws(
    () => assertDisposableDatabaseUri('mongodb://127.0.0.1:27017/noeis'),
    /disposable database/i,
    'The harness must refuse a non-disposable database.'
  );

  const args = parseArgs([
    '--live-model',
    `--mongo-uri=${safeUri}`,
    '--output-dir=tmp/agent-structure-acceptance'
  ]);
  assert.strictEqual(args.liveModel, true);
  assert.strictEqual(args.mongoUri, safeUri);
  assert.strictEqual(args.outputDir, 'tmp/agent-structure-acceptance');

  const plan = exactPlanForFixture({ articleIds: ['article-1', 'article-2'] });
  assert.strictEqual(plan.operations[0].payload, undefined);
  assert.strictEqual(plan.operations[0].name, TARGET_FOLDER_NAME);
  assert.deepStrictEqual(plan.operations.slice(1).map((operation) => operation.itemId), ['article-1', 'article-2']);
};

if (require.main === module) {
  run()
    .then(() => console.log('agent structure acceptance cli tests passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
