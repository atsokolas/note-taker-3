const assert = require('assert');
const { createRunFromProposalBundle } = require('../agentRuns');
const { executeAgentRun } = require('../agentRunExecution');

const createCreateModel = (prefix) => {
  const state = [];
  return {
    state,
    async create(payload = {}) {
      const doc = {
        _id: `${prefix}-${state.length + 1}`,
        ...payload,
        async save() {
          return this;
        }
      };
      state.push(doc);
      return doc;
    }
  };
};

const run = async () => {
  const AgentHandoff = createCreateModel('handoff');
  const createdThreads = [];

  const thread = {
    _id: 'thread-1',
    scope: {
      type: 'concept',
      id: 'concept-1',
      title: 'World Models'
    },
    proposalBundles: [
      {
        bundleId: 'bundle-1',
        title: 'Strengthen World Models + 1 more',
        status: 'pending',
        operations: [
          {
            opId: 'attach-material',
            type: 'attach_related_material',
            title: 'Pull in 2 related items',
            executionMode: 'direct',
            riskLevel: 'low',
            requiresApproval: false,
            target: {
              type: 'concept',
              id: 'concept-1',
              title: 'World Models'
            },
            metadata: {
              itemCount: 2
            }
          },
          {
            opId: 'create-handoff',
            type: 'create_handoff',
            title: 'Create a routed handoff',
            executionMode: 'direct',
            riskLevel: 'medium',
            requiresApproval: false,
            target: {
              type: 'concept',
              id: 'concept-1',
              title: 'World Models'
            }
          }
        ]
      }
    ],
    messages: [
      {
        role: 'assistant',
        text: 'I can pull in the strongest nearby material and route a follow-up handoff for deeper synthesis.',
        relatedItems: [
          { type: 'article', id: 'article-1', title: 'World Models and Error Correction', snippet: 'A strong supporting article.' },
          { type: 'notebook', id: 'note-1', title: 'Model drift notes', snippet: 'A notebook entry with adjacent evidence.' }
        ],
        proposalBundle: {
          bundleId: 'bundle-1',
          title: 'Strengthen World Models + 1 more',
          status: 'pending',
          operations: [
            {
              opId: 'attach-material',
              type: 'attach_related_material',
              title: 'Pull in 2 related items',
              executionMode: 'direct',
              riskLevel: 'low',
              requiresApproval: false
            },
            {
              opId: 'create-handoff',
              type: 'create_handoff',
              title: 'Create a routed handoff',
              executionMode: 'direct',
              riskLevel: 'medium',
              requiresApproval: false
            }
          ]
        }
      }
    ]
  };

  const createdRun = createRunFromProposalBundle({
    thread,
    bundleId: 'bundle-1',
    actor: { actorType: 'user', actorId: 'user-1' }
  });

  const executed = await executeAgentRun({
    run: createdRun,
    thread,
    userId: 'user-1',
    actor: { actorType: 'user', actorId: 'user-1' },
    AgentHandoff,
    createThreadForHandoff: async (payload = {}) => {
      const createdThread = {
        _id: `handoff-thread-${createdThreads.length + 1}`,
        ...payload
      };
      createdThreads.push(createdThread);
      return createdThread;
    },
    buildDefaultHandoffPlan: ({ title = '', objective = '' } = {}) => ({
      objective,
      steps: [{ id: 'execute', title: title || 'Execute', status: 'pending' }]
    }),
    buildDefaultHandoffCheckpoint: ({ title = '' } = {}) => ({
      summary: `Handoff created for ${title || 'untitled handoff'}.`
    }),
    sanitizeAgentHandoffDoc: (doc = {}) => ({
      handoffId: String(doc?._id || ''),
      title: String(doc?.title || ''),
      status: String(doc?.status || ''),
      threadId: String(doc?.threadId || '')
    })
  });

  assert.strictEqual(executed.status, 'completed', 'Safe direct-operation bundles should complete in one pass.');
  assert.strictEqual(executed.completedStepCount, 2, 'Both direct steps should be applied.');
  assert.strictEqual(
    executed.steps[0]?.metadata?.result?.itemCount,
    2,
    'Related-material execution should persist the staged item count on the run step.'
  );
  assert.strictEqual(
    executed.steps[0]?.metadata?.result?.items?.[0]?.title,
    'World Models and Error Correction',
    'Related-material execution should persist staged item details.'
  );
  assert.strictEqual(AgentHandoff.state.length, 1, 'Creating a handoff step should create a real handoff record.');
  assert.strictEqual(createdThreads.length, 1, 'Creating a handoff step should open a handoff thread.');
  assert.strictEqual(
    executed.steps[1]?.metadata?.result?.handoff?.handoffId,
    'handoff-1',
    'Handoff execution should persist the created handoff identity onto the run step.'
  );
  assert.strictEqual(
    AgentHandoff.state[0]?.context?.sourceRunId,
    createdRun.runId,
    'Created handoffs should retain the source run for traceability.'
  );

  const approvalQueued = await executeAgentRun({
    run: {
      runId: 'run-approval-1',
      threadId: 'thread-1',
      sourceBundleId: 'bundle-risky',
      title: 'Review sources + 1 more',
      status: 'pending',
      createdBy: { actorType: 'user', actorId: 'user-1' },
      lastActor: { actorType: 'user', actorId: 'user-1' },
      currentOpId: 'attach-material',
      blockedOpId: '',
      completedStepCount: 0,
      steps: [
        {
          opId: 'attach-material',
          type: 'attach_related_material',
          title: 'Pull in 2 related items',
          executionMode: 'direct',
          riskLevel: 'low',
          requiresApproval: false,
          target: {
            type: 'concept',
            id: 'concept-1',
            title: 'World Models'
          },
          metadata: {
            itemCount: 2
          }
        },
        {
          opId: 'delete-source',
          type: 'delete_attached_material',
          title: 'Remove weak source',
          executionMode: 'direct',
          riskLevel: 'high',
          requiresApproval: true,
          target: {
            type: 'concept',
            id: 'concept-1',
            title: 'World Models'
          },
          metadata: {}
        }
      ]
    },
    thread: {
      ...thread,
      proposalBundles: [],
      messages: [
        {
          role: 'assistant',
          text: 'I can attach the best nearby material and remove the weak source if you approve it.',
          relatedItems: [
            { type: 'article', id: 'article-1', title: 'World Models and Error Correction', snippet: 'A strong supporting article.' },
            { type: 'notebook', id: 'note-1', title: 'Model drift notes', snippet: 'A notebook entry with adjacent evidence.' }
          ]
        }
      ]
    },
    userId: 'user-1',
    actor: { actorType: 'user', actorId: 'user-1' },
    requestStepApproval: async ({ step }) => ({
      approvalId: 'approval-1',
      preview: {
        title: step.title
      }
    })
  });
  assert.strictEqual(
    approvalQueued.status,
    'paused_for_approval',
    'Risky steps should queue an approval and pause the run.'
  );
  assert.strictEqual(
    approvalQueued.steps[1]?.metadata?.approvalId,
    'approval-1',
    'Blocked run steps should retain the approval record that can resume them later.'
  );
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentRunExecution tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
