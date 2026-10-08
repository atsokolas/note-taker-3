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

const buildRouter = (overrides = {}) => buildAgentChatRouter({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  },
  authenticatePersonalAgentKey: (_req, _res, next) => next(),
  getUserAgentEntitlements: async () => ({ premiumWebResearchAvailable: false }),
  generateCollaborativeReply: async (args) => {
    overrides.calls.push(args);
    return {
      reply: 'Loss aversion "can make alternatives feel more painful than they are."',
      relatedItems: [],
      retrieval: { searchedWorkspace: false, relatedCount: 0 }
    };
  },
  normalizePersonalAgentCapabilities: (input) => input || {},
  mongoose: {
    Types: {
      ObjectId: {
        isValid(value) {
          return /^[a-f0-9]{24}$/i.test(String(value || ''));
        }
      }
    }
  },
  AgentThread: {
    async findOne() {
      return null;
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
  AgentArtifactDraft: {},
  normalizeThreadScope: (scope) => scope || {},
  appendThreadMessage: (targetThread, message) => {
    targetThread.messages.push({ ...message, createdAt: new Date().toISOString() });
  },
  compactThreadState: () => {},
  normalizeThreadPlanner: (planner) => planner || {},
  sanitizeAgentThreadDoc: (doc = {}) => ({ threadId: String(doc?._id || '') }),
  sanitizeAgentRunDoc: (doc = {}) => doc,
  createAgentArtifactDraftFromSkillReply: async () => null,
  createRunFromProposalBundle: () => ({}),
  executeAgentRun: async () => ({}),
  applyProposalBundleRunOutcome: () => {},
  createProposedChangesForRun: async () => {},
  requestRunStepApproval: async () => ({}),
  reconcileAgentRunState: async () => ({}),
  buildDefaultHandoffPlan: () => ({}),
  buildDefaultHandoffCheckpoint: () => ({}),
  createThreadForHandoff: async () => ({}),
  sanitizeAgentHandoffDoc: (doc = {}) => doc,
  shouldResolveExecutionIntent: () => false,
  resolveExecutableProposalBundle: () => ({ status: 'none' }),
  applyProposalBundleInvalidations: () => {},
  sanitizeAgentArtifactDraftDoc: (doc = {}) => doc,
  threadMessagesToHistory: (messages) => messages,
  truncate: (value) => String(value || '').slice(0, 120),
  trackEvent: () => {},
  EVENT_NAMES: {}
});

const run = async () => {
  const observed = { calls: [] };
  const app = express();
  app.use(express.json());
  app.use(buildRouter(observed));

  const { server, url } = await listen(app);
  const ask = async body => (await fetch(`${url}/api/agent/chat/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })).text();
  try {
    const question = 'How does loss aversion connect to opportunity cost?';
    const context = { type: 'workspace', id: 'wiki', pageId: '64a000000000000000000001', metadata: { surface: 'wiki_workspace' } };
    const body = await ask({ message: question, context });
    assert.strictEqual(observed.calls.length, 1, 'A wiki page question is answered by the one agent path.');
    assert.strictEqual(observed.calls[0].message, question);
    assert.strictEqual(observed.calls[0].context.pageId, context.pageId, 'The agent receives the open page.');
    assert.ok(observed.calls[0].signal, 'The agent can be stopped when the reader leaves.');
    assert.ok(body.includes('event: agent-delta'), 'The reply streams.');
    assert.ok(body.includes('Read the selected wiki page.'));
    assert.ok(body.includes('Answered from the selected wiki page.'));
    const final = JSON.parse(body.split('event: agent-final\ndata: ')[1].split('\n')[0]);
    assert.ok(final.reply.includes('more painful than they are'));
    assert.deepStrictEqual(final.activityReceipts.map(receipt => receipt.stage), ['read_page', 'retrieve', 'compose']);

    const exploration = { pageId: '64a000000000000000000001', claimId: 'claim-1', draft: { writing: 'My private distinction.', question: 'Does it hold?', pressure: { premise: 'Suppose there is no retry.' } } };
    const privateBody = await ask({ message: 'Think through my distinction.', context: { pageId: exploration.pageId, claimId: exploration.claimId, metadata: { exploration } } });
    assert.deepStrictEqual(observed.calls[1].context.metadata.exploration, exploration, 'The agent receives the exact working state.');
    assert.ok(!privateBody.includes('Read the selected wiki page.'), 'Do not announce unverified reading before the private context resolves.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentChatRoutes stream test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
