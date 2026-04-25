const assert = require('assert');

const {
  buildRegressionSuites,
  evaluateRegressionThresholds,
  formatReportMarkdown,
  parseArgs,
  summarizeSuite
} = require('./run_agent_harness_regression');

const run = async () => {
  const args = parseArgs([
    '--include-live',
    '--min-pass-rate=0.95',
    '--max-failures=1',
    '--max-controlled-write-failures=0',
    '--max-avg-latency-ms=5000',
    '--live-workflow=librarian,memory_steward'
  ]);
  assert.strictEqual(args.includeLive, true);
  assert.strictEqual(args.minPassRate, 0.95);
  assert.deepStrictEqual(args.liveWorkflows, ['librarian', 'memory_steward']);

  const suites = buildRegressionSuites(args);
  assert.strictEqual(suites.length, 4);
  assert.strictEqual(suites[0].name, 'synthetic_mock');
  assert.strictEqual(suites[3].name, 'realistic_live');
  assert.deepStrictEqual(suites[3].workflowIds, ['librarian', 'memory_steward']);

  const summary = summarizeSuite({
    suite: suites[0],
    result: {
      mode: 'mock',
      fixtureSet: 'synthetic',
      summary: {
        total: 2,
        passed: 2,
        failed: 0,
        passRate: 1,
        controlledWrites: { total: 0, written: 0, skipped: 0, failed: 0 },
        failures: []
      },
      results: [
        { latencyMs: 10 },
        { latencyMs: 30 }
      ],
      filePath: 'result.json',
      markdownPath: 'result.md'
    }
  });
  assert.strictEqual(summary.avgLatencyMs, 20);
  assert.strictEqual(summary.passRate, 1);

  const pass = evaluateRegressionThresholds({
    suites: [summary],
    thresholds: {
      minPassRate: 1,
      maxFailures: 0,
      maxControlledWriteFailures: 0
    }
  });
  assert.strictEqual(pass.ok, true);

  const fail = evaluateRegressionThresholds({
    suites: [
      {
        ...summary,
        failed: 1,
        passRate: 0.5,
        controlledWrites: { failed: 1 },
        avgLatencyMs: 9000
      }
    ],
    thresholds: {
      minPassRate: 1,
      maxFailures: 0,
      maxControlledWriteFailures: 0,
      maxAvgLatencyMs: 1000
    }
  });
  assert.strictEqual(fail.ok, false);
  assert.strictEqual(fail.failures.length, 4);

  const markdown = formatReportMarkdown({ suites: [summary], evaluation: pass, includeLive: false });
  assert.ok(markdown.includes('Agent Harness Regression Report'));
  assert.ok(markdown.includes('synthetic_mock'));
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agent harness regression tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
