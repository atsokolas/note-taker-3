const assert = require('assert');

const { appendGitHubStepSummary, fetchOutcomeTelemetry, parseArgs } = require('./run_agent_model_bakeoff');

const run = async () => {
  const args = parseArgs([
    '--fixture-set=realistic',
    '--workflow=thought_partner,librarian',
    '--route=partner_chat',
    '--candidate=openai/gpt-oss-120b:groq,moonshotai/Kimi-K2:together',
    '--output-dir=tmp/custom-bakeoff',
    '--outcome-telemetry=tmp/outcome.json',
    '--outcome-telemetry-url=https://example.test/api/agent/harness-metrics',
    '--outcome-telemetry-token=metrics-token',
    '--promotion-min-pass-rate=0.95',
    '--promotion-max-avg-latency-ms=12000',
    '--promotion-min-cases=3',
    '--promotion-max-overpredicting=1',
    '--fail-on-alert'
  ]);

  assert.strictEqual(args.fixtureSet, 'realistic');
  assert.deepStrictEqual(args.workflowIds, ['thought_partner', 'librarian']);
  assert.deepStrictEqual(args.routeIds, ['partner_chat']);
  assert.deepStrictEqual(args.candidates, [
    { model: 'openai/gpt-oss-120b', provider: 'groq' },
    { model: 'moonshotai/Kimi-K2', provider: 'together' }
  ]);
  assert.strictEqual(args.outputDir, 'tmp/custom-bakeoff');
  assert.strictEqual(args.outcomeTelemetryPath, 'tmp/outcome.json');
  assert.strictEqual(args.outcomeTelemetryUrl, 'https://example.test/api/agent/harness-metrics');
  assert.strictEqual(args.outcomeTelemetryToken, 'metrics-token');
  assert.strictEqual(args.minPassRate, '0.95');
  assert.strictEqual(args.maxAvgLatencyMs, '12000');
  assert.strictEqual(args.minCases, '3');
  assert.strictEqual(args.maxOutcomeOverpredicting, '1');
  assert.strictEqual(args.failOnAlert, true);

  const fetched = await fetchOutcomeTelemetry({
    url: 'https://example.test/api/agent/harness-metrics',
    token: 'metrics-token',
    fetchFn: async (url, options = {}) => {
      assert.strictEqual(url, 'https://example.test/api/agent/harness-metrics');
      assert.strictEqual(options.headers.Authorization, 'Bearer metrics-token');
      return {
        ok: true,
        json: async () => ({ outcomeTelemetry: { buckets: [{ id: 'agent_runs' }] } })
      };
    }
  });
  assert.strictEqual(fetched.outcomeTelemetry.buckets[0].id, 'agent_runs');

  const writes = [];
  const previousSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  process.env.GITHUB_STEP_SUMMARY = '/tmp/github-step-summary.md';
  const appended = appendGitHubStepSummary({
    result: {
      fixtureSet: 'realistic',
      filePath: 'tmp/result.json',
      markdownPath: 'tmp/result.md',
      summary: { passed: 1, total: 1, passRate: 1 },
      alerts: [{ level: 'warning', code: 'test_alert', message: 'Check model drift.' }],
      promotion: {
        recommendations: [
          { candidate: 'model-a:p1', status: 'promote', passRate: 1, avgLatencyMs: 100, blockers: [] }
        ]
      }
    },
    fsImpl: {
      appendFileSync: (_path, text) => writes.push(text)
    }
  });
  process.env.GITHUB_STEP_SUMMARY = previousSummaryPath;
  assert.strictEqual(appended, true);
  assert.ok(writes[0].includes('Promotion Recommendations'));
  assert.ok(writes[0].includes('test_alert'));
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agent model bakeoff cli tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
