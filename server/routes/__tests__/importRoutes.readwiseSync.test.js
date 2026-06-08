const assert = require('assert');
const express = require('express');
const http = require('http');
const axios = require('axios');

const { buildImportRouter } = require('../importRoutes');
const { encryptSecret } = require('../../utils/integrationSecrets');

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

const buildImportSessionStore = () => {
  const session = {
    _id: 'session-readwise',
    userId: 'user-1',
    provider: 'readwise',
    status: 'draft',
    sourceLabel: 'Readwise',
    progress: {
      stage: 'draft',
      percent: 0,
      indexingState: 'not_started'
    },
    preview: {},
    result: {},
    activation: {},
    lastError: '',
    async save() {
      return this;
    }
  };

  return {
    session,
    async findOne(query = {}) {
      return String(query?._id || '') === session._id && String(query?.userId || '') === session.userId
        ? session
        : null;
    }
  };
};

const buildConnectionStore = () => {
  const connection = {
    _id: 'rw-1',
    userId: 'user-1',
    provider: 'readwise',
    accountLabel: 'Readwise',
    encryptedApiToken: encryptSecret('readwise-token'),
    status: 'connected',
    health: 'healthy',
    lastSyncAt: null,
    lastValidatedAt: null,
    lastPreviewAt: null,
    lastError: '',
    async save() {
      return this;
    },
    toObject() {
      return {
        _id: this._id,
        provider: this.provider,
        mode: this.mode,
        accountLabel: this.accountLabel,
        externalAccountId: this.externalAccountId,
        status: this.status,
        health: this.health,
        scopes: this.scopes,
        lastSyncAt: this.lastSyncAt,
        lastValidatedAt: this.lastValidatedAt,
        lastPreviewAt: this.lastPreviewAt,
        lastError: this.lastError,
        createdAt: null,
        updatedAt: null
      };
    }
  };
  const mcpConnection = {
    _id: 'rw-mcp-1',
    userId: 'user-1',
    provider: 'readwise',
    mode: 'mcp_remote',
    accountLabel: 'Readwise MCP',
    externalAccountId: '',
    encryptedApiToken: '',
    status: 'draft',
    health: 'unknown',
    scopes: [],
    lastSyncAt: null,
    lastValidatedAt: null,
    lastPreviewAt: null,
    lastError: '',
    async save() {
      return this;
    },
    toObject: connection.toObject
  };

  return {
    connection,
    mcpConnection,
    async findOne(query = {}) {
      if (String(query?.mode || '') === 'mcp_remote') {
        return String(query?.userId || '') === mcpConnection.userId
          && String(query?.provider || '') === mcpConnection.provider
          ? mcpConnection
          : null;
      }
      return String(query?._id || '') === connection._id
        && String(query?.userId || '') === connection.userId
        && String(query?.provider || '') === connection.provider
        ? connection
        : null;
    }
  };
};

const createArticleModel = () => {
  const byUrl = new Map();
  let nextId = 1;

  function Article(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || `article-${nextId++}`;
    this.highlights = Array.isArray(this.highlights) ? this.highlights : [];
  }

  Article.findOne = async ({ userId, url } = {}) => {
    const article = byUrl.get(String(url || ''));
    if (!article || String(article.userId || '') !== String(userId || '')) return null;
    return article;
  };

  Article.prototype.save = async function save() {
    byUrl.set(String(this.url || ''), this);
    return this;
  };

  return Article;
};

const run = async () => {
  const originalAxiosGet = axios.get;
  const importSessions = buildImportSessionStore();
  const connections = buildConnectionStore();
  const Article = createArticleModel();
  const structureProposals = [];

  axios.get = async (url) => {
    if (String(url) === 'https://readwise.io/api/v2/export/') {
      return {
        data: {
          results: [{
            id: 'book-1',
            user_book_id: 'book-1',
            title: 'Deep Work',
            author: 'Cal Newport',
            highlights: [
              { id: 'highlight-empty', text: '' },
              { id: 'highlight-1', text: 'Attention is a choice.' }
            ]
          }],
          nextPageCursor: ''
        }
      };
    }
    throw new Error(`Unexpected axios.get URL: ${url}`);
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-1';
    next();
  });
  app.use(buildImportRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    upload: { single: () => (_req, _res, next) => next() },
    Papa: {},
    findRowValue: () => '',
    slugify: (value = '') => String(value || '').trim().toLowerCase().replace(/\s+/g, '-'),
    parseTagList: () => [],
    Article,
    trackEvent: () => {},
    EVENT_NAMES: {
      CAPTURE_COMPLETED: 'capture_completed'
    },
    path: require('path'),
    crypto: require('crypto'),
    TagMeta: {},
    NotebookEntry: {},
    AgentStructureProposal: {
      async findOne() {
        return null;
      },
      async create(payload = {}) {
        const proposal = {
          _id: `structure-${structureProposals.length + 1}`,
          ...payload
        };
        structureProposals.push(proposal);
        return proposal;
      }
    },
    ImportSession: importSessions,
    IntegrationConnection: connections,
    syncNotebookReferences: async () => {},
    enqueueArticleEmbedding: () => {},
    enqueueHighlightEmbedding: () => {},
    enqueueNotebookEmbedding: () => {}
  }));

  const { server, url } = await listen(app);
  try {
    const mcpResponse = await fetch(`${url}/api/import/readwise/mcp/connect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        accountLabel: 'Reader MCP'
      })
    });
    const mcpPayload = await mcpResponse.json();
    assert.strictEqual(mcpResponse.status, 200, `Readwise MCP connect should save a connection. body=${JSON.stringify(mcpPayload)}`);
    assert.strictEqual(mcpPayload.connection.mode, 'mcp_remote');
    assert.strictEqual(mcpPayload.connection.accountLabel, 'Reader MCP');
    assert.strictEqual(mcpPayload.connection.externalAccountId, 'https://mcp2.readwise.io/mcp');
    assert.strictEqual(mcpPayload.connection.status, 'connected');
    assert.strictEqual(mcpPayload.connection.health, 'healthy');
    assert.strictEqual(mcpPayload.connection.encryptedApiToken, undefined, 'Sanitized connection must not expose token fields.');

    const response = await fetch(`${url}/api/import/readwise/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        connectionId: 'rw-1',
        importSessionId: 'session-readwise'
      })
    });
    const payload = await response.json();

    assert.strictEqual(response.status, 200, `Readwise sync should tolerate invalid highlights. body=${JSON.stringify(payload)}`);
    assert.strictEqual(payload.importedArticles, 1, 'Readwise sync should create one article for the source document.');
    assert.strictEqual(payload.importedHighlights, 1, 'Readwise sync should keep valid highlights.');
    assert.strictEqual(payload.invalidSkips, 1, 'Readwise sync should count invalid highlights instead of crashing.');
    assert.strictEqual(importSessions.session.status, 'completed', 'The import session should finish successfully.');
    assert.strictEqual(importSessions.session.result.invalidSkips, 1, 'The session result should persist invalid skip counts.');
    assert.deepStrictEqual(importSessions.session.result.importedArticleIds, ['article-1'], 'The session should retain imported article IDs for cleanup.');
    assert.strictEqual(structureProposals.length, 1, 'Readwise imports should stage a concrete structure proposal.');
    assert.strictEqual(structureProposals[0].scope, 'import_session');
    assert.strictEqual(structureProposals[0].operations[0].type, 'create_folder');
    assert.strictEqual(structureProposals[0].operations[1].payload.itemId, 'article-1');
    assert.strictEqual(
      importSessions.session.agentSuggestions[0].structureProposalId,
      'structure-1',
      'The import cleanup suggestion should point at the staged structure proposal.'
    );
  } finally {
    axios.get = originalAxiosGet;
    await new Promise((resolve) => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('importRoutes Readwise sync route test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
