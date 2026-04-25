const assert = require('assert');
const express = require('express');

const { buildAgentHarnessMetricsRouter } = require('../agentHarnessMetricsRoutes');

const run = async () => {
  const app = express();
  app.use(buildAgentHarnessMetricsRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    getAgentHarnessMetricsSnapshot: async ({ userId, threadId }) => ({
      userId,
      threadId,
      rates: { runCompletionRate: 1 },
      funnel: {}
    }),
    getAgentHarnessRunHistorySnapshot: async ({ mode, limit }) => ({
      mode,
      limit: Number(limit),
      latestRun: { mode: 'live', passRate: 1 },
      aggregates: { workflows: {} },
      runs: []
    }),
    getAgentOutcomeTelemetrySnapshot: async ({ userId, threadId, runHistory }) => ({
      userId,
      threadId,
      sawRunHistory: Boolean(runHistory),
      summary: { bucketCount: 1, aligned: 1 },
      buckets: [
        {
          id: 'content_edits',
          label: 'Content edits',
          observed: { acceptanceRate: 1, resolved: 2 },
          harness: { passRate: 1, source: 'live:realistic' },
          delta: 0,
          status: 'aligned'
        }
      ]
    })
  }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/agent/harness-metrics?threadId=thread-1&mode=live&limit=5`, {
      headers: { Authorization: 'Bearer test' }
    });
    assert.strictEqual(response.status, 200);
    const payload = await response.json();
    assert.strictEqual(payload.metrics.userId, 'user-1');
    assert.strictEqual(payload.metrics.threadId, 'thread-1');
    assert.strictEqual(payload.runHistory.mode, 'live');
    assert.strictEqual(payload.runHistory.limit, 5);
    assert.strictEqual(payload.runHistory.latestRun.passRate, 1);
    assert.strictEqual(payload.metrics.runHistory.latestRun.passRate, 1);
    assert.strictEqual(payload.outcomeTelemetry.userId, 'user-1');
    assert.strictEqual(payload.outcomeTelemetry.threadId, 'thread-1');
    assert.strictEqual(payload.outcomeTelemetry.sawRunHistory, true);
    assert.strictEqual(payload.metrics.outcomeTelemetry.summary.aligned, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentHarnessMetricsRoutes tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
