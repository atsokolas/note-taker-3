const assert = require('assert');
const { buildImportRouter } = require('../importRoutes');

const getHandler = (router, routePath) => {
  const layer = router.stack.find(entry => entry.route?.path === routePath);
  assert(layer, `Expected route ${routePath}`);
  return layer.route.stack.at(-1).handle;
};

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

const run = async () => {
  const connection = {
    _id: 'connection-1',
    userId: 'user-1',
    provider: 'readwise',
    accountLabel: 'Reader',
    status: 'connected',
    health: 'healthy',
    encryptedAccessToken: 'encrypted-access',
    encryptedRefreshToken: 'encrypted-refresh',
    lastSyncAt: new Date('2026-09-17T10:00:00.000Z'),
    lastSyncResult: {
      importedArticles: 3,
      importedHighlights: 12
    },
    async save() {
      return this;
    },
    toObject() {
      return { ...this, save: undefined, toObject: undefined };
    }
  };
  const queryRef = {};
  const IntegrationConnection = {
    async findOne(query) {
      queryRef.value = query;
      return String(query._id) === connection._id && query.userId === connection.userId
        ? connection
        : null;
    }
  };
  const router = buildImportRouter({
    authenticateToken: (_req, _res, next) => next(),
    upload: { single: () => (_req, _res, next) => next() },
    Papa: {},
    findRowValue: () => '',
    slugify: value => value,
    parseTagList: () => [],
    Article: {},
    trackEvent: () => {},
    EVENT_NAMES: {},
    path: {},
    crypto: {},
    TagMeta: {},
    NotebookEntry: {},
    AgentStructureProposal: {},
    ImportSession: {},
    IntegrationConnection,
    syncNotebookReferences: async () => {},
    enqueueArticleEmbedding: async () => {},
    enqueueHighlightEmbedding: async () => {},
    enqueueNotebookEmbedding: async () => {}
  });

  const handler = getHandler(router, '/api/import/connections/:id/disconnect');
  const res = response();
  await handler({
    user: { id: 'user-1' },
    params: { id: 'connection-1' }
  }, res);

  assert.deepStrictEqual(queryRef.value, { _id: 'connection-1', userId: 'user-1' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(connection.status, 'revoked');
  assert.strictEqual(connection.encryptedAccessToken, '');
  assert.strictEqual(connection.encryptedRefreshToken, '');
  assert.strictEqual(res.body.connection.lastSyncAt, '2026-09-17T10:00:00.000Z');
  assert.strictEqual(res.body.boundaries.importedContent, 'retained');
  assert.strictEqual(res.body.boundaries.completedWork, 'unchanged');
  assert.strictEqual(res.body.boundaries.providerRevocation, 'not_confirmed');
  assert.strictEqual(res.body.boundaries.inFlightWork, 'not_cancelled');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
