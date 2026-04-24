const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildAgentChatRouter } = require('../agentChatRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve({
      server,
      url: `http://127.0.0.1:${address.port}`
    });
  });
});

const run = async () => {
  const trackedEvents = [];
  const savedThreads = [];
  let observedExecuteArgs = null;
  const thread = {
    _id: 'thread-1',
    scope: { type: 'concept', id: 'concept-1', title: 'World Models' },
    proposalBundles: [
      {
        bundleId: 'bundle-1',
        title: 'Rewrite World Models',
        status: 'pending',
        operations: [
          {
            opId: 'content-change',
            type: 'propose_content_change',
            title: 'Rewrite World Models',
            executionMode: 'proposed_change',
            riskLevel: 'low',
            requiresApproval: false,
            target: { type: 'concept', id: 'concept-1', title: 'World Models' }
          }
        ]
      }
    ],
    messages: [],
    async save() {
      savedThreads.push(this.messages.length);
      return this;
    }
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-1';
    next();
  });
  app.use(buildAgentChatRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    authenticatePersonalAgentKey: (_req, _res, next) => next(),
    getUserAgentEntitlements: async () => ({ premiumWebResearchAvailable: false }),
    generateCollaborativeReply: async () => ({ reply: 'unused in this test' }),
    normalizePersonalAgentCapabilities: (input) => input || {},
    mongoose: {
      Types: {
        ObjectId: {
          isValid(value) {
            return Boolean(String(value || '').trim());
          }
        }
      }
    },
    AgentThread: {
      async findOne(query = {}) {
        return String(query?._id || '') === 'thread-1' ? thread : null;
      },
      async create(payload = {}) {
        return {
          ...payload,
          _id: 'thread-created',
          messages: [],
          async save() {
            return this;
          }
        };
      }
    },
    AgentRun: {
      async create(payload = {}) {
        return {
          _id: 'run-1',
          ...payload,
          async save() {
            return this;
          },
          toObject() {
            return {
              _id: 'run-1',
              ...payload
            };
          }
        };
      }
    },
    AgentHandoff: {},
    AgentProtocolApproval: {},
    AgentProposedChange: {},
    TagMeta: {},
    NotebookEntry: {},
    AgentArtifactDraft: {},
    normalizeThreadScope: (scope) => scope || {},
    appendThreadMessage: (targetThread, message) => {
      targetThread.messages.push({
        ...message,
        createdAt: new Date().toISOString()
      });
    },
    compactThreadState: () => {},
    normalizeThreadPlanner: (planner) => planner || {},
    sanitizeAgentThreadDoc: (doc = {}) => ({
      threadId: String(doc?._id || ''),
      messages: Array.isArray(doc?.messages) ? doc.messages : []
    }),
    sanitizeAgentRunDoc: (doc = {}) => ({
      runId: String(doc?._id || doc?.runId || ''),
      status: String(doc?.status || '')
    }),
    createAgentArtifactDraftFromSkillReply: async () => null,
    createRunFromProposalBundle: ({ bundleId }) => ({
      runId: 'run-1',
      threadId: 'thread-1',
      sourceBundleId: bundleId,
      title: 'Rewrite World Models',
      status: 'pending',
      createdBy: { actorType: 'user', actorId: 'user-1' },
      lastActor: { actorType: 'user', actorId: 'user-1' },
      currentOpId: 'content-change',
      blockedOpId: '',
      steps: [
        {
          opId: 'content-change',
          type: 'propose_content_change',
          title: 'Rewrite World Models',
          executionMode: 'proposed_change',
          riskLevel: 'low',
          requiresApproval: false,
          status: 'pending'
        }
      ],
      completedStepCount: 0,
      startedAt: new Date('2026-04-18T12:00:00.000Z'),
      pausedAt: null,
      completedAt: null
    }),
    executeAgentRun: async (args = {}) => {
      observedExecuteArgs = args;
      return {
        ...args.run,
        status: 'completed',
        completedStepCount: 1,
        steps: args.run.steps.map((step) => ({
          ...step,
          status: 'applied'
        })),
        completedAt: new Date('2026-04-18T12:01:00.000Z')
      };
    },
    applyProposalBundleRunOutcome: () => {},
    createProposedChangesForRun: async () => {},
    requestRunStepApproval: async () => ({ approvalId: 'approval-1' }),
    reconcileAgentRunState: async ({ runId }) => ({
      _id: runId,
      runId,
      status: 'completed',
      completedStepCount: 1,
      steps: [
        {
          opId: 'content-change',
          status: 'applied'
        }
      ]
    }),
    buildDefaultHandoffPlan: () => ({}),
    buildDefaultHandoffCheckpoint: () => ({}),
    createThreadForHandoff: async () => ({}),
    sanitizeAgentHandoffDoc: (doc = {}) => doc,
    shouldResolveExecutionIntent: () => true,
    resolveExecutableProposalBundle: () => ({
      status: 'matched',
      bundle: thread.proposalBundles[0]
    }),
    applyProposalBundleInvalidations: () => thread,
    sanitizeAgentArtifactDraftDoc: (doc = {}) => doc,
    threadMessagesToHistory: (messages) => messages,
    truncate: (value) => String(value || '').slice(0, 120),
    trackEvent: (payload = {}) => {
      trackedEvents.push(payload);
    },
    EVENT_NAMES: {
      AGENT_EXECUTION_INTENT_MATCHED: 'agent_execution_intent_matched',
      AGENT_RUN_STARTED: 'agent_run_started',
      AGENT_RUN_COMPLETED: 'agent_run_completed'
    }
  }));

  const { server, url } = await listen(app);
  try {
    const response = await fetch(`${url}/api/agent/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        message: 'do it',
        persistThread: true
      })
    });
    const payload = await response.json();

    assert.strictEqual(response.status, 200, 'Execution-intent route test should complete successfully.');
    assert.strictEqual(payload.mode, 'execution_intent', 'The chat route should stay in execution-intent mode.');
    assert.strictEqual(payload.proposalResolution?.status, 'matched', 'The execution intent should resolve to the pending bundle.');
    assert.strictEqual(payload.run?.status, 'completed', 'The resolved bundle should execute through the run engine.');
    assert.strictEqual(observedExecuteArgs?.approvePendingApprovalSteps, true, 'Explicit chat execution should approve the matched pending bundle.');
    assert.ok(savedThreads.length > 0, 'The thread should be persisted after the execution-intent turn.');
    assert.deepStrictEqual(
      trackedEvents.map((entry) => entry.event),
      ['agent_execution_intent_matched', 'agent_run_started', 'agent_run_completed'],
      'Execution-intent route coverage should emit resolution and run lifecycle analytics.'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentChatRoutes execution-intent route test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
