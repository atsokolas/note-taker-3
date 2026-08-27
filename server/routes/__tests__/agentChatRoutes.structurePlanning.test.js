const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildAgentChatRouter } = require('../agentChatRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({
    server,
    url: `http://127.0.0.1:${server.address().port}`
  }));
});

const organizationResult = () => ({
  reply: 'I can prepare a plan.',
  capability: { id: 'capability.workspace.organize', boundary: 'review_required' },
  modelRoute: { profile: 'structure_planner' },
  proposalBundle: {
    bundleId: 'bundle-library-1',
    title: 'Clean up Library',
    operations: [{ type: 'organize_workspace' }]
  },
  relatedItems: [],
  citations: []
});

const run = async () => {
  const threads = [];
  const createdProposals = [];
  const app = express();
  app.use(express.json());
  app.use(buildAgentChatRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    authenticatePersonalAgentKey: (_req, _res, next) => next(),
    getUserAgentEntitlements: async () => ({ premiumWebResearchAvailable: false }),
    generateCollaborativeReply: async () => organizationResult(),
    normalizePersonalAgentCapabilities: (value) => value || {},
    mongoose: { Types: { ObjectId: { isValid: () => false } } },
    AgentThread: {
      async findOne() { return null; },
      async create(payload) {
        const thread = {
          ...payload,
          _id: `thread-${threads.length + 1}`,
          messages: [],
          async save() { return this; }
        };
        threads.push(thread);
        return thread;
      }
    },
    AgentRun: {},
    AgentHandoff: {},
    AgentProtocolApproval: {},
    AgentProposedChange: {},
    AgentStructureProposal: {},
    Folder: {},
    Article: {},
    NotebookFolder: {},
    TagMeta: {},
    NotebookEntry: {},
    WikiPage: {},
    WikiRevision: {},
    AgentArtifactDraft: {},
    normalizeThreadScope: (scope) => scope || {},
    appendThreadMessage: (thread, message) => thread.messages.push(message),
    compactThreadState: () => {},
    normalizeThreadPlanner: (planner) => planner || {},
    sanitizeAgentThreadDoc: (thread) => ({
      threadId: String(thread?._id || ''),
      messages: thread?.messages || []
    }),
    sanitizeAgentRunDoc: (value) => value,
    createAgentArtifactDraftFromSkillReply: async () => null,
    createRunFromProposalBundle: () => ({}),
    executeAgentRun: async () => ({}),
    applyProposalBundleRunOutcome: () => {},
    createProposedChangesForRun: async () => {},
    requestRunStepApproval: async () => null,
    reconcileAgentRunState: async () => null,
    buildDefaultHandoffPlan: () => ({}),
    buildDefaultHandoffCheckpoint: () => ({}),
    createThreadForHandoff: async () => ({}),
    sanitizeAgentHandoffDoc: (value) => value,
    shouldResolveExecutionIntent: () => false,
    resolveExecutableProposalBundle: () => ({ status: 'none' }),
    applyProposalBundleInvalidations: () => {},
    sanitizeAgentArtifactDraftDoc: (value) => value,
    sanitizeAgentStructureProposalDoc: (proposal) => ({
      structureProposalId: String(proposal?._id || ''),
      title: proposal?.title,
      operations: proposal?.operations || []
    }),
    planLibraryStructureProposal: async ({ request, sourceBundleId }) => {
      if (/unsafe/i.test(request)) {
        const error = new Error('The plan referenced an unknown article.');
        error.status = 422;
        throw error;
      }
      assert.strictEqual(sourceBundleId, 'bundle-library-1');
      return {
        draft: {
          userId: 'user-1',
          sourceBundleId,
          title: 'Tighten the Library structure',
          operations: [{ opId: 'move_item-1', type: 'move_item' }]
        },
        inventory: { folderCount: 2, articleCount: 12, unfiledCount: 3 },
        model: 'planner-model',
        provider: 'planner-provider',
        upstream: 'huggingface',
        upstreamAttempts: [{ upstream: 'huggingface', status: 'succeeded', latencyMs: 12 }]
      };
    },
    persistLibraryStructureProposal: async ({ draft, threadId }) => {
      const proposal = { ...draft, _id: 'proposal-1', sourceThreadId: threadId };
      createdProposals.push(proposal);
      return proposal;
    },
    threadMessagesToHistory: (messages) => messages || [],
    truncate: (value) => String(value || '').slice(0, 120),
    trackEvent: () => {},
    EVENT_NAMES: {}
  }));

  const { server, url } = await listen(app);
  try {
    const response = await fetch(`${url}/api/agent/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Organize my library.', context: { type: 'workspace', id: 'library' } })
    });
    const payload = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(payload.structureProposal?.structureProposalId, 'proposal-1');
    assert.strictEqual(payload.proposalBundle, null, 'The concrete structure proposal must replace the generic organization bundle.');
    assert.match(payload.reply, /nothing in your Library has changed yet/i);
    assert.strictEqual(payload.structurePlanning?.upstream, 'huggingface');
    assert.strictEqual(payload.structurePlanning?.upstreamAttempts?.[0]?.status, 'succeeded');
    assert.strictEqual(createdProposals.length, 1);
    assert.strictEqual(createdProposals[0].sourceThreadId, 'thread-1');
    assert.strictEqual(threads[0].messages[1].proposalBundle, null, 'Reloaded conversation must not restore the redundant bundle.');

    const failedResponse = await fetch(`${url}/api/agent/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Unsafe organize request' })
    });
    const failedPayload = await failedResponse.json();
    assert.strictEqual(failedResponse.status, 200);
    assert.strictEqual(failedPayload.structurePlanning?.status, 'failed');
    assert.strictEqual(failedPayload.structureProposal, undefined);
    assert.strictEqual(failedPayload.proposalBundle, null);
    assert.match(failedPayload.reply, /did not stage or apply anything/i);
    assert.strictEqual(createdProposals.length, 1, 'A rejected plan must create no review object.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => console.log('agentChatRoutes structure planning test passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
