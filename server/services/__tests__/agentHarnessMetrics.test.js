const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { hashValue } = require('../../utils/analytics');
const { getAgentHarnessMetricsSnapshot } = require('../agentHarnessMetrics');

const createFindModel = (rows = []) => ({
  async find(query = {}) {
    return rows.filter((row) => Object.entries(query).every(([key, expected]) => {
      if (expected === undefined || expected === null || expected === '') return true;
      return String(row?.[key] || '') === String(expected);
    }));
  }
});

const writeAnalyticsLog = async ({ filePath, userId, threadId }) => {
  const otherUserHash = hashValue('user-999');
  const userHash = hashValue(userId);
  const lines = [
    {
      event: 'agent_proposal_bundle_staged',
      timestamp: '2026-04-18T12:00:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId, bundleId: 'bundle-1' }
    },
    {
      event: 'agent_proposal_bundle_staged',
      timestamp: '2026-04-18T12:01:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId, bundleId: 'bundle-2' }
    },
    {
      event: 'agent_execution_intent_matched',
      timestamp: '2026-04-18T12:02:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId, bundleId: 'bundle-1' }
    },
    {
      event: 'agent_execution_intent_ambiguous',
      timestamp: '2026-04-18T12:03:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId }
    },
    {
      event: 'agent_run_started',
      timestamp: '2026-04-18T12:04:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId, runId: 'run-1' }
    },
    {
      event: 'agent_run_completed',
      timestamp: '2026-04-18T12:05:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId, runId: 'run-1' }
    },
    {
      event: 'agent_run_started',
      timestamp: '2026-04-18T12:06:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId, runId: 'run-2' }
    },
    {
      event: 'agent_run_awaiting_review',
      timestamp: '2026-04-18T12:07:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId, runId: 'run-2' }
    },
    {
      event: 'agent_artifact_draft_staged',
      timestamp: '2026-04-18T12:08:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId, draftId: 'draft-1' }
    },
    {
      event: 'agent_proposed_change_rejected',
      timestamp: '2026-04-18T12:09:00.000Z',
      actor: { userIdHash: userHash },
      properties: { threadId, proposedChangeId: 'change-2' }
    },
    {
      event: 'agent_run_started',
      timestamp: '2026-04-18T12:10:00.000Z',
      actor: { userIdHash: otherUserHash },
      properties: { threadId, runId: 'other-run' }
    }
  ];

  await fs.writeFile(
    filePath,
    `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
    'utf8'
  );
};

const run = async () => {
  const userId = 'user-123';
  const threadId = 'thread-123';
  const analyticsLogPath = path.join(os.tmpdir(), `agent-harness-metrics-${Date.now()}.jsonl`);

  await writeAnalyticsLog({ filePath: analyticsLogPath, userId, threadId });

  const snapshot = await getAgentHarnessMetricsSnapshot({
    userId,
    threadId,
    analyticsLogPath,
    AgentThread: createFindModel([
      {
        _id: threadId,
        userId,
        proposalBundles: [
          { bundleId: 'bundle-1', status: 'applied' },
          { bundleId: 'bundle-2', status: 'pending' },
          { bundleId: 'bundle-3', status: 'invalidated' }
        ]
      }
    ]),
    AgentRun: createFindModel([
      { _id: 'run-1', userId, threadId, status: 'completed' },
      { _id: 'run-2', userId, threadId, status: 'awaiting_review' },
      { _id: 'run-3', userId, threadId, status: 'paused_for_approval' }
    ]),
    AgentProposedChange: createFindModel([
      { _id: 'change-1', userId, sourceThreadId: threadId, status: 'applied' },
      { _id: 'change-2', userId, sourceThreadId: threadId, status: 'rejected' },
      { _id: 'change-3', userId, sourceThreadId: threadId, status: 'pending' }
    ]),
    AgentArtifactDraft: createFindModel([
      { _id: 'draft-1', userId, sourceThreadId: threadId, status: 'pending' },
      { _id: 'draft-2', userId, sourceThreadId: threadId, status: 'dismissed' }
    ]),
    AgentProtocolApproval: createFindModel([
      { _id: 'approval-1', userId, status: 'rejected', op: 'runs.resume' },
      { _id: 'approval-2', userId, status: 'approved', op: 'runs.resume' }
    ])
  });

  assert.strictEqual(snapshot.funnel.proposalBundlesStaged, 2, 'Proposal staging count should come from harness analytics events.');
  assert.strictEqual(snapshot.funnel.executionIntentMatched, 1, 'Matched do-it resolutions should be counted.');
  assert.strictEqual(snapshot.funnel.executionIntentAmbiguous, 1, 'Ambiguous do-it resolutions should be counted.');
  assert.strictEqual(snapshot.funnel.runsStarted, 2, 'Run starts should be counted from analytics events.');
  assert.strictEqual(snapshot.funnel.runsCompleted, 1, 'Completed runs should be counted from analytics events.');
  assert.strictEqual(snapshot.funnel.draftFallbacks, 1, 'Fallback-to-draft should be counted from analytics events.');
  assert.strictEqual(snapshot.bundleStatuses.total, 3, 'Bundle status counts should come from current thread state.');
  assert.strictEqual(snapshot.runStatuses.awaiting_review, 1, 'Run status counts should include awaiting review runs.');
  assert.strictEqual(snapshot.proposedChangeStatuses.rejected, 1, 'Rejected proposed changes should be counted.');
  assert.strictEqual(snapshot.undoSignals.total, 3, 'Undo/rejection signals should combine rejected changes, rejected approvals, and dismissed drafts.');
  assert.ok(snapshot.rates.bundleResolutionSuccessRate > 0 && snapshot.rates.bundleResolutionSuccessRate < 1, 'Resolution success rate should be derived from execution-intent outcomes.');
  assert.ok(snapshot.rates.draftFallbackRate > 0 && snapshot.rates.draftFallbackRate < 1, 'Draft fallback rate should be derived from run starts vs draft fallbacks.');
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentHarnessMetrics tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
