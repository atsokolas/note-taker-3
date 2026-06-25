const assert = require('assert');
const { buildAiMaintenanceRouter } = require('../aiMaintenanceRoutes');

const createResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
};

const getRouteHandler = (router, path, index = 1) => {
  const layer = router.stack.find(entry => entry.route?.path === path);
  assert(layer, `Expected route ${path} to exist`);
  return layer.route.stack[index].handle;
};

const createEmbeddingJobModel = (jobs = [], queryRef = {}) => ({
  find(query) {
    queryRef.query = query;
    const chain = {
      select() { return chain; },
      sort() { return chain; },
      limit() { return chain; },
      async lean() { return jobs; }
    };
    return chain;
  }
});

const run = async () => {
  const queryRef = {};
  const router = buildAiMaintenanceRouter({
    authenticateToken: (_req, _res, next) => next(),
    isAiEnabled: () => true,
    EmbeddingJob: createEmbeddingJobModel([
      {
        _id: 'job-1',
        collection: 'articles',
        objectId: 'article-1',
        status: 'failed',
        attemptCount: 3,
        lastError: 'HF 429 rate limit exceeded '.repeat(20),
        updatedAt: '2026-06-25T12:00:00.000Z'
      },
      {
        _id: 'job-2',
        collection: 'notebook_entries',
        objectId: 'entry-1',
        status: 'queued',
        attemptCount: 0
      },
      {
        _id: 'job-3',
        collection: 'highlights',
        objectId: 'highlight-1',
        status: 'completed',
        attemptCount: 1
      }
    ], queryRef)
  });

  const handler = getRouteHandler(router, '/api/ai/embedding-jobs/status');
  const req = { user: { id: 'user-1' } };
  const res = createResponse();
  await handler(req, res);

  assert.deepStrictEqual(queryRef.query, {
    $or: [
      { 'payload.userId': 'user-1' }
    ]
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 'warning');
  assert.deepStrictEqual(res.body.counts, {
    queued: 1,
    running: 0,
    failed: 1,
    abandoned: 0,
    completed: 1,
    total: 3
  });
  assert.strictEqual(res.body.failedJobs.length, 1);
  assert.strictEqual(res.body.failedJobs[0].id, 'job-1');
  assert(res.body.failedJobs[0].lastError.length <= 240);

  const emptyRouter = buildAiMaintenanceRouter({
    authenticateToken: (_req, _res, next) => next()
  });
  const emptyHandler = getRouteHandler(emptyRouter, '/api/ai/embedding-jobs/status');
  const emptyRes = createResponse();
  await emptyHandler(req, emptyRes);
  assert.strictEqual(emptyRes.statusCode, 200);
  assert.strictEqual(emptyRes.body.status, 'ready');
  assert.strictEqual(emptyRes.body.counts.total, 0);

  console.log('aiMaintenanceRoutes embedding status tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
