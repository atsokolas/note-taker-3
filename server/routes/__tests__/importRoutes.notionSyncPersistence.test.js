const assert = require('assert');
const express = require('express');
const http = require('http');
const axios = require('axios');

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

const createNotebookEntryModel = () => {
  const store = new Map();
  let idCounter = 0;

  function NotebookEntry(payload = {}) {
    Object.assign(this, payload);
    if (!this._id) {
      idCounter += 1;
      this._id = `entry-${idCounter}`;
    }
    this.blocks = Array.isArray(this.blocks) ? this.blocks : [];
    this.tags = Array.isArray(this.tags) ? this.tags : [];
    this.importMeta = this.importMeta || {};
  }

  NotebookEntry.findOne = async (query = {}) => {
    for (const entry of store.values()) {
      const providerMatch = String(entry.importMeta?.provider || '') === String(query['importMeta.provider'] || '');
      const externalMatch = String(entry.importMeta?.externalId || '') === String(query['importMeta.externalId'] || '');
      const userMatch = String(entry.userId || '') === String(query.userId || '');
      if (providerMatch && externalMatch && userMatch) {
        return entry;
      }
    }
    return null;
  };

  NotebookEntry.prototype.save = async function save() {
    store.set(String(this._id), this);
    return this;
  };

  return NotebookEntry;
};

const buildImportSessionStore = () => {
  const session = {
    _id: 'session-notion',
    userId: 'user-1',
    provider: 'notion',
    status: 'draft',
    sourceLabel: 'Product HQ',
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
    _id: 'notion-1',
    userId: 'user-1',
    provider: 'notion',
    mode: 'oauth',
    accountLabel: 'Product HQ',
    encryptedAccessToken: encryptSecret('notion-token'),
    status: 'connected',
    health: 'healthy',
    lastSyncAt: null,
    lastValidatedAt: null,
    lastPreviewAt: null,
    lastSyncResult: null,
    lastReceipt: null,
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
        lastSyncResult: this.lastSyncResult,
        lastReceipt: this.lastReceipt,
        lastError: this.lastError,
        createdAt: null,
        updatedAt: null
      };
    }
  };

  return {
    connection,
    async findOne(query = {}) {
      return String(query?._id || '') === connection._id
        && String(query?.userId || '') === connection.userId
        && String(query?.provider || '') === connection.provider
        ? connection
        : null;
    },
    find(query = {}) {
      const matches = String(query?.userId || '') === connection.userId
        && (!query?.provider || String(query.provider) === connection.provider);
      const rows = matches ? [connection.toObject()] : [];
      return {
        sort() {
          return {
            lean: async () => rows
          };
        }
      };
    }
  };
};

const run = async () => {
  const notebookImportTreeService = require('../../services/notebookImportTreeService');
  const originalEnsureNotebookImportFolderPath = notebookImportTreeService.ensureNotebookImportFolderPath;
  notebookImportTreeService.ensureNotebookImportFolderPath = async ({
    sourceLabel = '',
    sourcePath = []
  } = {}) => ({
    folder: { _id: 'imports-root' },
    createdFolders: [],
    sourcePath: [sourceLabel, ...(Array.isArray(sourcePath) ? sourcePath : [])]
      .map(segment => String(segment || '').trim())
      .filter(Boolean)
      .join(' / ')
  });

  delete require.cache[require.resolve('../importRoutes')];
  const { buildImportRouter } = require('../importRoutes');

  const originalAxiosPost = axios.post;
  const originalAxiosGet = axios.get;

  axios.post = async (url, body) => {
    if (String(url) === 'https://api.notion.com/v1/search') {
      const filterValue = body?.filter?.value || '';
      if (filterValue === 'page') {
        return {
          data: {
            results: [{
              object: 'page',
              id: 'page-1',
              properties: {
                Name: {
                  type: 'title',
                  title: [{ plain_text: 'Research note' }]
                }
              }
            }],
            has_more: false
          }
        };
      }
      if (filterValue === 'data_source') {
        return {
          data: {
            results: [],
            has_more: false
          }
        };
      }
    }
    throw new Error(`Unexpected axios.post URL: ${url}`);
  };

  axios.get = async (url) => {
    if (String(url).includes('/blocks/') && String(url).includes('/children')) {
      return {
        data: {
          results: [],
          has_more: false
        }
      };
    }
    throw new Error(`Unexpected axios.get URL: ${url}`);
  };

  const importSessions = buildImportSessionStore();
  const connections = buildConnectionStore();
  const NotebookEntry = createNotebookEntryModel();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-notion-sync';
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
    Article: {},
    trackEvent: () => {},
    EVENT_NAMES: {
      CAPTURE_COMPLETED: 'capture_completed'
    },
    path: require('path'),
    crypto: require('crypto'),
    TagMeta: {},
    NotebookEntry,
    AgentStructureProposal: {
      async findOne() {
        return null;
      },
      async create() {
        return null;
      }
    },
    ImportSession: importSessions,
    IntegrationConnection: connections,
    syncNotebookReferences: async () => {},
    enqueueArticleEmbedding: () => {},
    enqueueHighlightEmbedding: () => {},
    enqueueNotebookEmbedding: () => Promise.resolve()
  }));

  const { server, url } = await listen(app);
  try {
    const syncResponse = await fetch(`${url}/api/import/notion/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-import-session-id': importSessions.session._id
      },
      body: JSON.stringify({ connectionId: 'notion-1', importSessionId: importSessions.session._id })
    });
    const syncPayload = await syncResponse.json();
    assert.strictEqual(syncResponse.status, 200, `Notion sync failed: ${JSON.stringify(syncPayload)}`);
    assert.strictEqual(syncPayload.importedNotes, 1);
    assert.strictEqual(syncPayload.skippedRows, 0);
    assert.ok(syncPayload.connection?.lastSyncAt, 'Sync response should include lastSyncAt on connection.');
    assert.deepStrictEqual(syncPayload.connection.lastSyncResult, {
      importedNotes: 1,
      skippedRows: 0,
      indexingQueued: 1,
      indexingFailures: 0,
      completedAt: syncPayload.connection.lastSyncResult.completedAt
    });
    assert.ok(syncPayload.connection.lastSyncResult.completedAt, 'lastSyncResult.completedAt should be serialized.');
    assert.ok(syncPayload.connection.lastReceipt, 'Sync response should include a durable Noeis receipt.');
    assert.strictEqual(syncPayload.connection.lastReceipt.kind, 'import');
    assert.strictEqual(syncPayload.connection.lastReceipt.source, 'notion');
    assert.strictEqual(syncPayload.connection.lastReceipt.sourceLabel, 'Product HQ');
    assert.strictEqual(syncPayload.connection.lastReceipt.status, 'completed');
    assert.strictEqual(syncPayload.connection.lastReceipt.metrics.importedNotes, 1);
    assert.match(syncPayload.connection.lastReceipt.summary, /Imported 1 note/);
    assert.strictEqual(syncPayload.receipt.source, 'notion');

    assert.ok(connections.connection.lastSyncResult, 'Connection should persist lastSyncResult in memory.');
    assert.strictEqual(connections.connection.lastSyncResult.importedNotes, 1);
    assert.strictEqual(connections.connection.lastSyncResult.indexingQueued, 1);
    assert.ok(connections.connection.lastReceipt, 'Connection should persist lastReceipt in memory.');
    assert.strictEqual(importSessions.session.receipt.source, 'notion');

    const listResponse = await fetch(`${url}/api/import/connections?provider=notion`);
    const listPayload = await listResponse.json();
    assert.strictEqual(listResponse.status, 200, `Connection list failed: ${JSON.stringify(listPayload)}`);
    assert.strictEqual(listPayload.connections.length, 1);
    assert.strictEqual(listPayload.connections[0].lastSyncResult.importedNotes, 1);
    assert.strictEqual(listPayload.connections[0].lastSyncResult.skippedRows, 0);
    assert.strictEqual(listPayload.connections[0].lastSyncResult.indexingQueued, 1);
    assert.strictEqual(listPayload.connections[0].lastSyncResult.indexingFailures, 0);
    assert.ok(listPayload.connections[0].lastSyncResult.completedAt);
    assert.strictEqual(listPayload.connections[0].lastReceipt.source, 'notion');
    assert.strictEqual(listPayload.connections[0].lastReceipt.sourceLabel, 'Product HQ');
    assert.strictEqual(listPayload.connections[0].lastReceipt.metrics.importedNotes, 1);

    console.log('importRoutes.notionSyncPersistence.test.js passed');
  } finally {
    axios.post = originalAxiosPost;
    axios.get = originalAxiosGet;
    notebookImportTreeService.ensureNotebookImportFolderPath = originalEnsureNotebookImportFolderPath;
    server.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
