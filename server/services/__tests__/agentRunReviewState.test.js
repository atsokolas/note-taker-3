const assert = require('assert');
const {
  deriveRunLifecycleState,
  dismissBlockedRunStep,
  reconcileAgentRunState
} = require('../agentRunReviewState');

const createMemoryModel = ({ rows = [] } = {}) => {
  const state = [...rows];

  const withSave = (row) => {
    if (!row) return null;
    if (typeof row.save === 'function') return row;
    row.save = async function save() {
      return this;
    };
    return row;
  };

  return {
    state,
    async findOne(query = {}) {
      return withSave(
        state.find((row) => Object.entries(query).every(([key, value]) => String(row[key]) === String(value))) || null
      );
    },
    async find(query = {}) {
      return state.filter((row) => Object.entries(query).every(([key, value]) => String(row[key]) === String(value)));
    }
  };
};

const run = async () => {
  const AgentRun = createMemoryModel({
    rows: [
      {
        _id: 'run-1',
        userId: 'user-1',
        status: 'completed',
        currentOpId: '',
        blockedOpId: '',
        completedStepCount: 1,
        steps: [
          {
            opId: 'content-change',
            type: 'propose_content_change',
            status: 'applied',
            metadata: {
              proposedChangeId: 'pc-1'
            }
          }
        ]
      }
    ]
  });
  const AgentProposedChange = createMemoryModel({
    rows: [
      {
        _id: 'pc-1',
        userId: 'user-1',
        sourceRunId: 'run-1',
        status: 'pending'
      }
    ]
  });

  const awaitingReview = await reconcileAgentRunState({
    AgentRun,
    AgentProposedChange,
    userId: 'user-1',
    runId: 'run-1'
  });
  assert.strictEqual(
    awaitingReview.status,
    'awaiting_review',
    'Runs with pending proposed changes should remain in review instead of completing.'
  );

  AgentProposedChange.state[0].status = 'applied';
  const completed = await reconcileAgentRunState({
    AgentRun,
    AgentProposedChange,
    userId: 'user-1',
    runId: 'run-1'
  });
  assert.strictEqual(
    completed.status,
    'completed',
    'Runs should complete after every proposed change tied to the run is resolved.'
  );

  const dismissed = dismissBlockedRunStep({
    run: {
      runId: 'run-2',
      status: 'paused_for_approval',
      currentOpId: 'delete-source',
      blockedOpId: 'delete-source',
      completedStepCount: 1,
      steps: [
        {
          opId: 'attach-material',
          status: 'applied',
          metadata: {}
        },
        {
          opId: 'delete-source',
          status: 'blocked',
          metadata: {
            approvalId: 'approval-1'
          }
        }
      ]
    },
    approvalId: 'approval-1'
  });
  assert.strictEqual(
    dismissed.steps[1].status,
    'dismissed',
    'Rejecting a run approval should dismiss only the blocked step.'
  );
  assert.strictEqual(
    deriveRunLifecycleState({ run: dismissed, proposedChanges: [] }),
    'completed',
    'A run should complete once the blocked step is dismissed and no reviews remain.'
  );
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentRunReviewState tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
