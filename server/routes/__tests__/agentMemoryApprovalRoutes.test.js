const assert = require('assert');
const express = require('express');

const { buildAgentMemoryApprovalRouter } = require('../agentMemoryApprovalRoutes');

const run = async () => {
  const created = [];
  const app = express();
  app.use(express.json());
  app.use(buildAgentMemoryApprovalRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    AgentProtocolApproval: {},
    createMemoryCommitApproval: async (input) => {
      created.push(input);
      return {
        approval: { approvalId: 'approval-1', op: 'memory.commit' },
        payload: { items: input.updates },
        preview: { itemCount: input.updates.length }
      };
    }
  }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/agent/memory-approvals`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-1',
        workspaceType: 'workspace',
        workspaceId: 'workspace-1',
        updates: [{ type: 'current_focus', text: 'Stage this memory update.' }]
      })
    });
    assert.strictEqual(response.status, 202);
    const payload = await response.json();
    assert.strictEqual(payload.approval.op, 'memory.commit');
    assert.strictEqual(payload.preview.itemCount, 1);
    assert.strictEqual(created[0].userId, 'user-1');
    assert.strictEqual(created[0].threadId, 'thread-1');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentMemoryApprovalRoutes tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
