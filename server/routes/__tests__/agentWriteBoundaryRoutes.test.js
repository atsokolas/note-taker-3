const assert = require('assert');
const express = require('express');

const { buildAgentWriteBoundaryRouter } = require('../agentWriteBoundaryRoutes');

const run = async () => {
  const app = express();
  app.use(buildAgentWriteBoundaryRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    getAgentWriteBoundarySummary: async ({ userId, threadId, workspaceType, workspaceId, limit }) => ({
      userId,
      threadId,
      workspaceType,
      workspaceId,
      limit: Number(limit),
      memoryCommits: { total: 2, recent: [] },
      structureProposals: { pending: 1, applied: 0, rejected: 0, recent: [] },
      safetyBoundary: {
        directWriteType: 'working_memory',
        stagedWriteType: 'structure_proposal',
        posture: 'Workspace structure changes are staged for review.'
      }
    })
  }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/agent/write-boundary?threadId=thread-1&workspaceType=workspace&workspaceId=workspace-1&limit=4`, {
      headers: { Authorization: 'Bearer test' }
    });
    assert.strictEqual(response.status, 200);
    const payload = await response.json();
    assert.strictEqual(payload.summary.userId, 'user-1');
    assert.strictEqual(payload.summary.threadId, 'thread-1');
    assert.strictEqual(payload.summary.workspaceType, 'workspace');
    assert.strictEqual(payload.summary.workspaceId, 'workspace-1');
    assert.strictEqual(payload.summary.limit, 4);
    assert.strictEqual(payload.writeBoundary.memoryCommits.total, 2);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentWriteBoundaryRoutes tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
