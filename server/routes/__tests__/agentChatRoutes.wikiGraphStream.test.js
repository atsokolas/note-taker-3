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
  generateCollaborativeReply: async () => {
    throw new Error('generic collaborative reply should not run for wiki graph ask');
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
  WikiPage: {
    findOne() {
      return {
        select() {
          return {
            async lean() {
              return {
                _id: '64a000000000000000000001',
                title: 'Loss Aversion',
                slug: 'loss-aversion',
                plainText: 'Loss aversion can make alternatives feel more painful than they are.',
                sourceRefs: []
              };
            }
          };
        }
      };
    }
  },
  WikiSchemaSettings: null,
  askWikiPage: async () => ({
    answer: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Loss aversion connects to Opportunity Cost because overweighting a visible loss can hide the better foregone alternative.'
        }]
      }]
    },
    citationIndexesUsed: [],
    model: 'test',
    status: 'answered',
    provenance: {
      mode: 'graph_expanded',
      searchedSummary: 'Searched 2 wiki pages.',
      summary: 'Used 2 wiki pages',
      wikiPages: [
        { id: '64a000000000000000000001', title: 'Loss Aversion', role: 'selected' },
        { id: '64a000000000000000000002', title: 'Opportunity Cost', role: 'related' }
      ]
    }
  }),
  loadWikiAskCorpus: async (args = {}) => {
    overrides.observedCorpusArgs = args;
    return {
      relatedPages: [{
        _id: '64a000000000000000000002',
        title: 'Opportunity Cost',
        plainText: 'Opportunity cost is the value of the next best alternative.'
      }],
      conceptRecords: [],
      backlinkRows: []
    };
  },
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
  const observed = {};
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-1';
    next();
  });
  app.use(buildRouter(observed));

  const { server, url } = await listen(app);
  try {
    const response = await fetch(`${url}/api/agent/chat/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'How does loss aversion connect to opportunity cost?',
        context: {
          type: 'workspace',
          id: 'wiki',
          pageId: '64a000000000000000000001',
          metadata: { surface: 'wiki_workspace' }
        }
      })
    });
    const body = await response.text();
    assert.strictEqual(response.status, 200, 'Wiki graph stream should return a successful SSE response.');
    assert.strictEqual(
      observed.observedCorpusArgs?.question,
      'How does loss aversion connect to opportunity cost?',
      'The graph corpus loader should receive the user question.'
    );
    assert.ok(body.includes('Opportunity Cost'), 'The streamed answer should include the mentioned related wiki page.');
    assert.ok(body.includes('Searched 2 wiki pages.'), 'The activity stream should expose graph search provenance.');
    assert.ok(body.includes('Read Loss Aversion + Opportunity Cost.'), 'The activity stream should name both wiki pages read.');
    assert.ok(
      !body.includes('Answered from the selected wiki page.'),
      'Graph-expanded answers should not claim they only used the selected page.'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('agentChatRoutes wiki graph stream test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
