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
