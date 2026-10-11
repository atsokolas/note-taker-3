const assert = require('assert');
const express = require('express');
const { buildLegacyContentRouter } = require('./legacyContentRoutes');

const USER_ID = '6873e7773cc513750ec17055';
const ARTICLE_ID = '68b300000000000000000021';

const createHarness = ({ failFirstCleanup = false } = {}) => {
  let article = {
    _id: ARTICLE_ID,
    userId: USER_ID,
    highlights: [{ _id: 'highlight-1' }, { _id: 'highlight-2' }]
  };
  let cleanupAttempts = 0;
  const cleanupCalls = [];
  const app = express();
  app.use(buildLegacyContentRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: USER_ID };
      next();
    },
    mongoose: { Types: { ObjectId: String } },
    Note: {},
    normalizeChecklist: value => value,
    Folder: {},
    normalizePdfs: value => value,
    Article: {
      findOneAndDelete: async ({ _id, userId }) => {
        if (!article || String(_id) !== ARTICLE_ID || String(userId) !== USER_ID) return null;
        const deleted = article;
        article = null;
        return deleted;
      }
    },
    enqueueArticleEmbedding: () => {},
    deleteArticleEmbeddingState: async payload => {
      cleanupCalls.push(payload);
      cleanupAttempts += 1;
      if (failFirstCleanup && cleanupAttempts === 1) throw new Error('temporary Atlas cleanup failure');
    },
    getFoldersWithCounts: async () => [],
    normalizeItemType: value => value
  }));
  return { app, cleanupCalls };
};

const withHarness = async (options, verify) => {
  const harness = createHarness(options);
  const server = await new Promise(resolve => {
    const listener = harness.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const { port } = server.address();
  const remove = async () => fetch(`http://127.0.0.1:${port}/articles/${ARTICLE_ID}`, { method: 'DELETE' });
  try {
    await verify({ ...harness, remove });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

const run = async () => {
  await withHarness({}, async ({ cleanupCalls, remove }) => {
    const deleted = await remove();
    assert.strictEqual(deleted.status, 200);
    assert.deepStrictEqual(cleanupCalls[0], { userId: USER_ID, articleId: ARTICLE_ID });

    const retry = await remove();
    assert.strictEqual(retry.status, 404);
    assert.deepStrictEqual(
      cleanupCalls[1],
      { userId: USER_ID, articleId: ARTICLE_ID },
      'a retry finishes exact owner-scoped cleanup even after the source row is gone'
    );
  });

  await withHarness({ failFirstCleanup: true }, async ({ cleanupCalls, remove }) => {
    const failed = await remove();
    assert.strictEqual(failed.status, 500, 'cleanup failure stays visible');

    const retry = await remove();
    assert.strictEqual(retry.status, 404);
    assert.strictEqual(cleanupCalls.length, 2, 'retry completes idempotent Atlas cleanup');
  });

  console.log('legacyContentRoutes article delete tests passed');
};

run().catch(error => {
  console.error(error);
  process.exit(1);
});
