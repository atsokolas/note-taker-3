const assert = require('assert');
const fs = require('fs');

const {
  buildOutcomeComparison,
  buildPromotionRecommendations,
  formatBakeoffMarkdown,
  parseCandidateRoutes,
  runModelBakeoff,
  selectBakeoffSpecs,
  summarizeBakeoffResults
} = require('./modelBakeoff');

const run = async () => {
  const candidates = parseCandidateRoutes('openai/gpt-oss-120b:groq,moonshotai/Kimi-K2:together');
  assert.deepStrictEqual(candidates, [
    { model: 'openai/gpt-oss-120b', provider: 'groq' },
    { model: 'moonshotai/Kimi-K2', provider: 'together' }
  ]);

  const specs = selectBakeoffSpecs({
    fixtureSet: 'realistic',
    workflowIds: ['thought_partner', 'librarian']
  });
  assert.strictEqual(specs.length, 2);
  assert.ok(specs.every((spec) => spec.fixtureSet === 'realistic'));

  const summary = summarizeBakeoffResults([
    { workflowId: 'thought_partner', route: 'partner_chat', model: 'model-a', provider: 'p1', ok: true, latencyMs: 100 },
    { workflowId: 'librarian', route: 'structure_planner', model: 'model-a', provider: 'p1', ok: false, latencyMs: 300, validation: { message: 'bad plan' } },
    { workflowId: 'librarian', route: 'structure_planner', model: 'model-b', provider: 'p2', ok: true, latencyMs: 500 }
  ]);
  assert.strictEqual(summary.total, 3);
  assert.strictEqual(summary.passed, 2);
  assert.strictEqual(summary.byCandidate.find((row) => row.key === 'model-a:p1').passRate, 0.5);
  assert.strictEqual(summary.failures[0].message, 'bad plan');

  const outcomeComparison = buildOutcomeComparison({
    results: [
      { workflowId: 'librarian', route: 'structure_planner', model: 'model-a', provider: 'p1', ok: true, latencyMs: 100 },
      { workflowId: 'librarian', route: 'structure_planner', model: 'model-a', provider: 'p1', ok: true, latencyMs: 100 }
    ],
    outcomeTelemetry: {
      buckets: [
        {
          id: 'structure_plans',
          label: 'Structure plans',
          observed: { acceptanceRate: 0.25, resolved: 4 }
        }
      ]
    }
  });
  assert.strictEqual(outcomeComparison.buckets.length, 1);
  assert.strictEqual(outcomeComparison.buckets[0].status, 'bakeoff_overpredicts');

  const promotion = buildPromotionRecommendations({
    summary,
    outcomeComparison,
    policy: {
      minPassRate: 0.75,
      maxAvgLatencyMs: 1000,
      minCases: 1,
      maxOutcomeOverpredicting: 0
    }
  });
  assert.strictEqual(promotion.recommendations.find((row) => row.candidate === 'model-b:p2').status, 'promote');
  assert.strictEqual(promotion.recommendations.find((row) => row.candidate === 'model-a:p1').status, 'hold');

  const markdown = formatBakeoffMarkdown({
    fixtureSet: 'realistic',
    summary,
    outcomeComparison,
    promotion,
    alerts: [{ level: 'warning', code: 'test_alert', message: 'Alert for test.' }],
    results: [
      { workflowId: 'librarian', route: 'structure_planner', model: 'model-a', provider: 'p1', ok: false, latencyMs: 300, validation: { message: 'bad plan' } }
    ]
  });
  assert.ok(markdown.includes('Agent Model Bakeoff'));
  assert.ok(markdown.includes('model-a:p1'));
  assert.ok(markdown.includes('Production Outcome Comparison'));
  assert.ok(markdown.includes('Promotion Recommendations'));
  assert.ok(markdown.includes('test_alert'));

  const result = await runModelBakeoff({
    fixtureSet: 'realistic',
    workflowIds: ['thought_partner'],
    candidates: [{ model: 'mock-model', provider: 'local' }],
    outcomeTelemetry: {
      buckets: [
        {
          id: 'agent_runs',
          label: 'Agent runs',
          observed: { acceptanceRate: 1, resolved: 1 }
        }
      ]
    },
    outputDir: 'tmp/agent-model-bakeoff-test-runs',
    chatCompleteFn: async ({ modelRoutes }) => ({
      text: 'The strongest claim is that trust boundaries matter because the agent operates inside a durable workspace. Clarify which actions remain reviewable and which low-risk memory updates can commit directly.',
      model: modelRoutes[0].model,
      provider: modelRoutes[0].provider
    })
  });
  assert.strictEqual(result.summary.total, 1);
  assert.strictEqual(result.summary.failed, 0);
  assert.strictEqual(result.outcomeComparison.buckets.length, 1);
  assert.strictEqual(result.promotion.recommendations[0].status, 'promote');
  assert.ok(fs.existsSync(result.filePath));
  assert.ok(fs.existsSync(result.markdownPath));
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agent model bakeoff tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
