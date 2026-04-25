const assert = require('assert');

const {
  MEMORY_APPROVAL_OP,
  createMemoryCommitApproval,
  executeMemoryCommitApproval,
  normalizeMemoryApprovalItems
} = require('../agentMemoryApprovals');

const run = async () => {
  const items = normalizeMemoryApprovalItems({
    userId: 'user-1',
    workspaceType: 'workspace',
    workspaceId: 'workspace-1',
    updates: [
      { type: 'current_focus', text: 'Review memory approvals.' },
      { type: 'bad_type', text: 'Ignore me.' },
      { type: 'next_move', text: 'Approve staged memory writes.' }
    ],
    sourceIdPrefix: 'memory-test'
  });
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].sourceType, 'agent.memory_steward');
  assert.ok(items[0].tags.includes('current_focus'));

  const approvals = [];
  const approvalResult = await createMemoryCommitApproval({
    AgentProtocolApproval: {
      async create(payload) {
        approvals.push(payload);
        return { _id: 'approval-1', ...payload };
      }
    },
    userId: 'user-1',
    threadId: 'thread-1',
    workspaceType: 'workspace',
    workspaceId: 'workspace-1',
    updates: [
      { type: 'current_focus', text: 'Review memory approvals.' }
    ]
  });
  assert.strictEqual(approvals.length, 1);
  assert.strictEqual(approvals[0].op, MEMORY_APPROVAL_OP);
  assert.strictEqual(approvals[0].preview.itemCount, 1);
  assert.strictEqual(approvalResult.payload.items.length, 1);

  const memoryRows = [];
  const commitResult = await executeMemoryCommitApproval({
    approval: {
      userId: 'user-1',
      payload: approvalResult.payload
    },
    WorkingMemoryItem: {
      async findOne() {
        return null;
      },
      async create(payload) {
        memoryRows.push(payload);
        return { _id: `wm-${memoryRows.length}`, ...payload };
      }
    }
  });
  assert.strictEqual(commitResult.createdCount, 1);
  assert.strictEqual(memoryRows.length, 1);
  assert.strictEqual(memoryRows[0].workspaceId, 'workspace-1');
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentMemoryApprovals tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
