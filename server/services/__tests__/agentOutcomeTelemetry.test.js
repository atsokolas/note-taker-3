const assert = require('assert');

const {
  buildBucket,
  getAgentOutcomeTelemetrySnapshot,
  getHarnessWorkflowPassRate
} = require('../agentOutcomeTelemetry');

const createFindModel = (rows = []) => ({
  async find(query = {}) {
    return rows.filter((row) => Object.entries(query).every(([key, expected]) => {
      if (expected === undefined || expected === null || expected === '') return true;
      return String(row?.[key] || '') === String(expected);
    }));
  }
});

const runHistory = {
  runs: [
    {
      mode: 'mock',
      fixtureSet: 'synthetic',
      results: [
        { id: 'editor', ok: true },
        { id: 'librarian', ok: true }
      ]
    },
    {
      mode: 'live',
      fixtureSet: 'realistic',
      results: [
        { id: 'editor', ok: true },
        { id: 'writing_copilot', ok: true },
        { id: 'librarian', ok: true },
        { id: 'synthesizer', ok: false },
        { id: 'research_planner', ok: true }
      ]
    }
  ]
};

const run = async () => {
  const editorRate = getHarnessWorkflowPassRate({
    runHistory,
    workflowIds: ['editor', 'writing_copilot']
  });
  assert.strictEqual(editorRate.passRate, 1);
  assert.strictEqual(editorRate.source, 'live:realistic');

  const bucket = buildBucket({
    id: 'content_edits',
    observedAccepted: 1,
    observedRejected: 3,
    harness: editorRate
  });
  assert.strictEqual(bucket.observed.acceptanceRate, 0.25);
  assert.strictEqual(bucket.status, 'real_world_underperforming');

  const snapshot = await getAgentOutcomeTelemetrySnapshot({
    userId: 'user-1',
    threadId: 'thread-1',
    runHistory,
    AgentRun: createFindModel([
      { userId: 'user-1', threadId: 'thread-1', status: 'completed' },
      { userId: 'user-1', threadId: 'thread-1', status: 'failed' }
    ]),
    AgentProposedChange: createFindModel([
      { userId: 'user-1', sourceThreadId: 'thread-1', status: 'applied' },
      { userId: 'user-1', sourceThreadId: 'thread-1', status: 'rejected' }
    ]),
    AgentStructureProposal: createFindModel([
      { userId: 'user-1', sourceThreadId: 'thread-1', status: 'applied' },
      { userId: 'user-1', sourceThreadId: 'thread-1', status: 'pending' }
    ]),
    AgentArtifactDraft: createFindModel([
      { userId: 'user-1', sourceThreadId: 'thread-1', status: 'promoted' },
      { userId: 'user-1', sourceThreadId: 'thread-1', status: 'dismissed' }
    ])
  });

  const contentBucket = snapshot.buckets.find((entry) => entry.id === 'content_edits');
  const structureBucket = snapshot.buckets.find((entry) => entry.id === 'structure_plans');
  const artifactBucket = snapshot.buckets.find((entry) => entry.id === 'artifact_drafts');
  assert.strictEqual(snapshot.buckets.length, 4);
  assert.strictEqual(contentBucket.observed.acceptanceRate, 0.5);
  assert.strictEqual(structureBucket.observed.pending, 1);
  assert.strictEqual(artifactBucket.harness.passRate, 0.5);
  assert.strictEqual(snapshot.summary.bucketCount, 4);
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentOutcomeTelemetry tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
