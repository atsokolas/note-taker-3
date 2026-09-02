const assert = require('assert');
const express = require('express');
const { buildLegacyContentRouter } = require('../legacyContentRoutes');

const USER_ID = '64f100000000000000000001';

/*
 * The shelf, asked for by name.
 *
 * `{ userId, evergreen, updatedAt }` has been on the article collection the
 * whole time with nothing asking for it: every reader of the canon so far has
 * pulled the entire library down and filtered in the browser. The paper deals
 * one card off the shelf each morning and is not going to download three
 * hundred sources to do it.
 */

const captured = [];

const Article = {
  aggregate: async (pipeline) => {
    captured.push(pipeline);
    return [];
  }
};

const app = express();
app.use(express.json());
app.use(buildLegacyContentRouter({
  authenticateToken: (req, res, next) => {
    req.user = { id: USER_ID };
    return next();
  },
  mongoose: { Types: { ObjectId: String } },
  Note: {},
  normalizeChecklist: (value) => value,
  Folder: {},
  normalizePdfs: (value) => value,
  Article,
  enqueueArticleEmbedding: () => {},
  safeMapEmbedding: () => {},
  articleToEmbeddingItems: () => [],
  queueEmbeddingUpsert: () => {},
  getFoldersWithCounts: async () => [],
  normalizeItemType: (value) => value,
  buildEmbeddingId: () => '',
  queueEmbeddingDelete: () => {}
}));

const matchOf = (pipeline) => (pipeline.find((stage) => stage.$match) || {}).$match || {};

const run = () => new Promise((resolve, reject) => {
  const server = app.listen(0, '127.0.0.1', async () => {
    const { port } = server.address();
    const get = (path) => fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { Authorization: 'Bearer qa' }
    });

    try {
      captured.length = 0;
      const kept = await get('/api/articles?scope=kept');
      assert.strictEqual(kept.status, 200, 'the shelf must answer');
      assert.strictEqual(
        matchOf(captured[0]).evergreen,
        true,
        'scope=kept must filter on evergreen so the index can be used'
      );

      captured.length = 0;
      await get('/api/articles?scope=all');
      assert.strictEqual(
        matchOf(captured[0]).evergreen,
        undefined,
        'an ordinary listing must not quietly become the shelf'
      );

      captured.length = 0;
      await get('/api/articles?scope=unfiled');
      assert.strictEqual(
        matchOf(captured[0]).evergreen,
        undefined,
        'the other scopes keep their own meaning'
      );
      assert.ok(matchOf(captured[0]).$or, 'unfiled still means unfoldered');

      server.close();
      resolve();
    } catch (error) {
      server.close();
      reject(error);
    }
  });
});

if (require.main === module) {
  run()
    .then(() => console.log('legacy content route kept-scope tests passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
