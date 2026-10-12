const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildAgentHandoffRouter } = require('../agentHandoffRoutes');

const run = async () => {
  const queries = [];
  const app = express();
  app.use(buildAgentHandoffRouter({
    mongoose,
    authenticatePersonalAgentKey: (_req, _res, next) => next(),
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    AgentHandoff: {
      find: (query) => {
        queries.push(query);
        return { sort: () => ({ limit: async () => [{ _id: query._id }] }) };
      }
    },
    sanitizeAgentHandoffDoc: doc => ({ handoffId: String(doc._id) }),
    AGENT_HANDOFF_STATUSES: new Set(['pending']),
    AGENT_HANDOFF_TASK_TYPES: new Set(['research']),
    safeAgentHandoffLimit: (value, fallback) => Number(value) || fallback
  }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const list = path => fetch(`http://127.0.0.1:${port}/api/agent/protocol/handoffs${path}`, { headers: { Authorization: 'Bearer test' } });
    const handoffId = new mongoose.Types.ObjectId().toString();

    // A link to one handoff finds it whatever status the queue is filtered to.
    const named = await list(`?handoffId=${handoffId}&status=pending`);
    assert.strictEqual(named.status, 200);
    assert.deepStrictEqual(await named.json(), { handoffs: [{ handoffId }] });
    assert.deepStrictEqual(queries.pop(), { userId: 'user-1', _id: handoffId });

    assert.strictEqual((await list('?handoffId=not-an-id')).status, 400);
    assert.strictEqual(queries.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentHandoffRoutes list tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
