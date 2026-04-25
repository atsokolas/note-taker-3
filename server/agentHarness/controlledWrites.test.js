const assert = require('assert');

const {
  executeControlledWriteForHarnessResult,
  normalizeWriteMode
} = require('./controlledWrites');

const run = async () => {
  assert.strictEqual(normalizeWriteMode('dry-run'), 'dry_run');
  assert.strictEqual(normalizeWriteMode('stage'), 'stage');
  assert.strictEqual(normalizeWriteMode('write'), 'commit');

  const librarianResult = {
    id: 'librarian',
    output: {
      title: 'Organize workspace',
      summary: 'Stage a reversible plan.',
      riskLevel: 'medium',
      operations: [
        { type: 'create_folder', title: 'Create Workspace Agent Research folder', requiresApproval: true }
      ]
    }
  };

  const dryRun = await executeControlledWriteForHarnessResult({
    result: librarianResult,
    writeMode: 'dry_run',
    approved: false
  });
  assert.strictEqual(dryRun.written, false);
  assert.strictEqual(dryRun.draft.type, 'AgentStructureProposal');

  await assert.rejects(
    () => executeControlledWriteForHarnessResult({
      result: librarianResult,
      writeMode: 'stage',
      approved: false,
      models: { AgentStructureProposal: { async create(payload) { return payload; } } }
    }),
    /explicit approval/
  );

  const structureRows = [];
  const staged = await executeControlledWriteForHarnessResult({
    result: librarianResult,
    writeMode: 'stage',
    approved: true,
    models: {
      AgentStructureProposal: {
        async create(payload) {
          structureRows.push(payload);
          return { _id: 'proposal-1', ...payload };
        }
      }
    },
    options: {
      userId: 'user-1',
      threadId: 'thread-1'
    }
  });
  assert.strictEqual(staged.action, 'stage_structure_proposal');
  assert.strictEqual(staged.written, true);
  assert.strictEqual(structureRows.length, 1);
  assert.strictEqual(structureRows[0].status, 'pending');

  const memoryResult = {
    id: 'memory_steward',
    output: {
      writeMode: 'commit',
      updates: [
        { type: 'current_focus', text: 'Test controlled writes.' },
        { type: 'open_question', text: 'Which writes require review?' },
        { type: 'next_move', text: 'Commit only after approval.' }
      ]
    }
  };

  const memoryStage = await executeControlledWriteForHarnessResult({
    result: memoryResult,
    writeMode: 'stage',
    approved: true
  });
  assert.strictEqual(memoryStage.written, false);
  assert.strictEqual(memoryStage.skipped, true);

  const memoryApprovals = [];
  const stagedMemory = await executeControlledWriteForHarnessResult({
    result: memoryResult,
    writeMode: 'stage',
    approved: true,
    models: {
      AgentProtocolApproval: {
        async create(payload) {
          memoryApprovals.push(payload);
          return { _id: 'memory-approval-1', ...payload };
        }
      }
    },
    options: {
      userId: 'user-1',
      threadId: 'thread-1',
      workspaceType: 'workspace',
      workspaceId: 'workspace-1'
    }
  });
  assert.strictEqual(stagedMemory.action, 'stage_memory_approval');
  assert.strictEqual(stagedMemory.written, true);
  assert.strictEqual(memoryApprovals.length, 1);
  assert.strictEqual(memoryApprovals[0].op, 'memory.commit');

  const memoryRows = [];
  const memoryCommit = await executeControlledWriteForHarnessResult({
    result: memoryResult,
    writeMode: 'commit',
    approved: true,
    models: {
      WorkingMemoryItem: {
        async findOne() {
          return null;
        },
        async create(payload) {
          memoryRows.push(payload);
          return { _id: `memory-${memoryRows.length}`, ...payload };
        }
      }
    },
    options: {
      userId: 'user-1',
      workspaceType: 'workspace',
      workspaceId: 'workspace-1'
    }
  });
  assert.strictEqual(memoryCommit.action, 'commit_working_memory');
  assert.strictEqual(memoryCommit.written, true);
  assert.strictEqual(memoryRows.length, 3);
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agent controlled write tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
