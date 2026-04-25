const assert = require('assert');

const { getAgentWriteBoundarySummary } = require('../agentWriteBoundarySummary');

const makeModel = (rows = []) => ({
  async countDocuments(query = {}) {
    return rows.filter((row) => {
      if (query.status && typeof query.status === 'string' && row.status !== query.status) return false;
      if (query.status?.$in && !query.status.$in.includes(row.status)) return false;
      if (query.sourceThreadId && String(row.sourceThreadId) !== String(query.sourceThreadId)) return false;
      if (query.workspaceType && row.workspaceType !== query.workspaceType) return false;
      if (query.workspaceId && row.workspaceId !== query.workspaceId) return false;
      return true;
    }).length;
  },
  find(query = {}) {
    const filtered = rows.filter((row) => {
      if (query.sourceThreadId && String(row.sourceThreadId) !== String(query.sourceThreadId)) return false;
      if (query.workspaceType && row.workspaceType !== query.workspaceType) return false;
      if (query.workspaceId && row.workspaceId !== query.workspaceId) return false;
      return true;
    });
    return {
      sort() {
        return {
          limit(limit) {
            return filtered.slice(0, limit);
          }
        };
      }
    };
  }
});

const run = async () => {
  const summary = await getAgentWriteBoundarySummary({
    userId: 'user-1',
    threadId: 'thread-1',
    workspaceType: 'workspace',
    workspaceId: 'workspace-1',
    WorkingMemoryItem: makeModel([
      {
        _id: 'wm-1',
        sourceType: 'agent_harness.memory_steward',
        sourceId: 'memory:current-focus',
        textSnippet: 'Current focus from the memory steward.',
        tags: ['memory-steward', 'current_focus'],
        status: 'active',
        workspaceType: 'workspace',
        workspaceId: 'workspace-1',
        createdAt: '2026-04-25T00:00:00.000Z'
      }
    ]),
    AgentStructureProposal: makeModel([
      {
        _id: 'proposal-1',
        sourceThreadId: 'thread-1',
        status: 'pending',
        title: 'Organize library',
        operations: [{ opId: 'move-1' }]
      },
      {
        _id: 'proposal-2',
        sourceThreadId: 'thread-1',
        status: 'applied',
        title: 'Create folder',
        operations: [{ opId: 'create-1' }]
      }
    ])
  });

  assert.strictEqual(summary.memoryCommits.total, 1);
  assert.strictEqual(summary.memoryCommits.recent[0].sourceType, 'agent_harness.memory_steward');
  assert.strictEqual(summary.structureProposals.pending, 1);
  assert.strictEqual(summary.structureProposals.applied, 1);
  assert.strictEqual(summary.safetyBoundary.directWriteType, 'working_memory');
  assert.strictEqual(summary.safetyBoundary.stagedWriteType, 'structure_proposal');
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentWriteBoundarySummary tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
