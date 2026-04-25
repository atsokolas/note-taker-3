const assert = require('assert');

const {
  buildStructureProposalDraft,
  buildWorkingMemoryDrafts,
  createStructureProposalFromHarness,
  writeWorkingMemoryUpdatesFromHarness
} = require('./serviceAdapters');

const run = async () => {
  const structureOutput = {
    title: 'Organize AI reading imports',
    summary: 'Stage a reversible cleanup plan.',
    riskLevel: 'medium',
    operations: [
      { type: 'create_folder', title: 'Create AI Reading Partner folder', requiresApproval: true },
      { type: 'move_item', title: 'Move Reading questions into AI Reading Partner', requiresApproval: true },
      { type: 'rename_folder', title: 'Rename Concept scraps to Concept ideas', requiresApproval: true }
    ]
  };

  const structureDraft = buildStructureProposalDraft({
    output: structureOutput,
    userId: 'user-1',
    threadId: 'thread-1'
  });

  assert.strictEqual(structureDraft.userId, 'user-1');
  assert.strictEqual(structureDraft.sourceThreadId, 'thread-1');
  assert.strictEqual(structureDraft.status, 'pending');
  assert.strictEqual(structureDraft.operations.length, 3);
  assert.strictEqual(structureDraft.operations[0].type, 'create_folder');
  assert.strictEqual(structureDraft.operations[0].targetDomain, 'notebook');
  assert.strictEqual(structureDraft.operations[0].payload.name, 'AI Reading Partner folder');
  assert.strictEqual(structureDraft.operations[1].type, 'move_item');
  assert.strictEqual(structureDraft.operations[1].payload.requiresResolution, true);
  assert.strictEqual(structureDraft.operations[2].type, 'rename_folder');
  assert.strictEqual(structureDraft.operations[2].risk, 'medium');

  const createdRows = [];
  const createdStructure = await createStructureProposalFromHarness({
    AgentStructureProposal: {
      async create(payload) {
        createdRows.push(payload);
        return { _id: 'proposal-1', ...payload };
      }
    },
    output: structureOutput,
    userId: 'user-1',
    threadId: 'thread-1'
  });
  assert.strictEqual(createdRows.length, 1);
  assert.strictEqual(createdStructure.created._id, 'proposal-1');

  const memoryOutput = {
    writeMode: 'commit',
    updates: [
      { type: 'current_focus', text: 'Define and test canonical workflows.' },
      { type: 'open_question', text: 'Which workflows mutate state versus stage proposals?' },
      { type: 'next_move', text: 'Run integration dry-run and inspect payloads.' }
    ]
  };

  const memoryDrafts = buildWorkingMemoryDrafts({
    output: memoryOutput,
    userId: 'user-1',
    workspaceType: 'concept',
    workspaceId: 'concept-1'
  });
  assert.strictEqual(memoryDrafts.length, 3);
  assert.strictEqual(memoryDrafts[0].sourceType, 'agent_harness.memory_steward');
  assert.strictEqual(memoryDrafts[0].workspaceType, 'concept');
  assert.strictEqual(memoryDrafts[0].workspaceId, 'concept-1');
  assert.ok(memoryDrafts[0].tags.includes('current_focus'));

  const memoryRows = [];
  const memoryWrite = await writeWorkingMemoryUpdatesFromHarness({
    WorkingMemoryItem: {
      async create(payload) {
        memoryRows.push(payload);
        return { _id: `wm-${memoryRows.length}`, ...payload };
      }
    },
    output: memoryOutput,
    userId: 'user-1',
    workspaceType: 'concept',
    workspaceId: 'concept-1'
  });
  assert.strictEqual(memoryRows.length, 3);
  assert.strictEqual(memoryWrite.created.length, 3);

  const dedupedWrite = await writeWorkingMemoryUpdatesFromHarness({
    WorkingMemoryItem: {
      async findOne(query) {
        return query.sourceId.endsWith('current-focus') ? { _id: 'existing-memory', ...query } : null;
      },
      async create(payload) {
        return { _id: `deduped-${payload.sourceId}`, ...payload };
      }
    },
    output: memoryOutput,
    userId: 'user-1',
    workspaceType: 'concept',
    workspaceId: 'concept-1',
    dedupe: true
  });
  assert.strictEqual(dedupedWrite.skippedExisting.length, 1);
  assert.strictEqual(dedupedWrite.created.length, 2);
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agent harness service adapter tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
