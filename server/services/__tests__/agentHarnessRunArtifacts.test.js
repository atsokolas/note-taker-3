const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  buildComparisonMatrices,
  getAgentHarnessRunHistorySnapshot,
  parseRunTimestamp
} = require('../agentHarnessRunArtifacts');

const writeRun = async ({ dir, stamp, mode, fixtureSet = 'synthetic', results }) => {
  const passed = results.filter((result) => result.ok).length;
  const summary = {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? Number((passed / results.length).toFixed(4)) : 0,
    failures: results.filter((result) => !result.ok).map((result) => ({
      id: result.id,
      route: result.route,
      message: result.validation?.message || 'failed'
    }))
  };
  await fs.writeFile(
    path.join(dir, `${stamp}-${mode}.json`),
    JSON.stringify({ mode, fixtureSet, summary: { ...summary, fixtureSet }, results }, null, 2),
    'utf8'
  );
};

const run = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-harness-runs-'));
  assert.ok(parseRunTimestamp('2026-04-25T00-07-03-887Z-live.json'), 'Timestamp parser should read harness run filenames.');

  await writeRun({
    dir,
    stamp: '2026-04-25T00-00-00-000Z',
    mode: 'mock',
    results: [
      { id: 'librarian', route: 'structure_planner', ok: true, latencyMs: 10, model: 'mock', provider: 'local' }
    ]
  });
  await writeRun({
    dir,
    stamp: '2026-04-25T00-01-00-000Z',
    mode: 'live',
    fixtureSet: 'realistic',
    results: [
      { id: 'librarian', route: 'structure_planner', fixtureSet: 'realistic', ok: true, latencyMs: 500, model: 'openai/gpt-oss-120b', provider: 'groq' },
      { id: 'memory_steward', route: 'artifact_draft', fixtureSet: 'realistic', ok: false, latencyMs: 400, model: 'openai/gpt-oss-120b', provider: 'groq', validation: { message: 'bad memory update' } }
    ]
  });
  await writeRun({
    dir,
    stamp: '2026-04-25T00-02-00-000Z',
    mode: 'live',
    fixtureSet: 'realistic',
    results: [
      { id: 'critic', route: 'critique', fixtureSet: 'realistic', ok: true, latencyMs: 700, model: 'moonshotai/Kimi-K2', provider: 'together' }
    ]
  });

  const snapshot = await getAgentHarnessRunHistorySnapshot({ runDir: dir, limit: 10 });
  assert.strictEqual(snapshot.totalRuns, 3);
  assert.strictEqual(snapshot.runs.length, 3);
  assert.strictEqual(snapshot.latestRun.mode, 'live');
  assert.strictEqual(snapshot.latestRun.fixtureSet, 'realistic');
  assert.strictEqual(snapshot.latestRun.failed, 0);
  assert.strictEqual(snapshot.aggregates.workflows.librarian.total, 2);
  assert.strictEqual(snapshot.aggregates.workflows.librarian.passed, 2);
  assert.strictEqual(snapshot.aggregates.workflows.memory_steward.failed, 1);
  assert.strictEqual(snapshot.aggregates.routes.structure_planner.passRate, 1);
  assert.strictEqual(snapshot.aggregates.modelProviders['openai/gpt-oss-120b:groq'].total, 2);
  assert.strictEqual(snapshot.aggregates.fixtureSets.synthetic.total, 1);
  assert.strictEqual(snapshot.aggregates.fixtureSets.realistic.failed, 1);
  assert.ok(snapshot.aggregates.comparisons.byRouteModelProvider.find((row) => row.key === 'structure_planner | openai/gpt-oss-120b | groq'));
  assert.ok(snapshot.aggregates.comparisons.byLiveRouteModelProvider.find((row) => row.key === 'structure_planner | openai/gpt-oss-120b | groq'));
  assert.ok(!snapshot.aggregates.comparisons.byLiveRouteModelProvider.find((row) => row.key === 'structure_planner | mock | local'));
  assert.ok(snapshot.aggregates.comparisons.byFixtureModelProvider.find((row) => row.key === 'realistic | moonshotai/Kimi-K2 | together'));
  assert.ok(snapshot.aggregates.comparisons.byRouteFixture.find((row) => row.key === 'artifact_draft | realistic'));
  assert.strictEqual(snapshot.aggregates.comparisons.failureTypes[0].message, 'bad memory update');

  const directComparison = buildComparisonMatrices(snapshot.runs);
  assert.ok(directComparison.byRouteModelProvider.length >= 3);

  const liveOnly = await getAgentHarnessRunHistorySnapshot({ runDir: dir, mode: 'live', limit: 10 });
  assert.strictEqual(liveOnly.totalRuns, 2);
  assert.strictEqual(liveOnly.runs[0].mode, 'live');
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentHarnessRunArtifacts tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
