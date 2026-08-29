const assert = require('assert');
const express = require('express');
const { buildLegacyContentRouter } = require('../legacyContentRoutes');

const USER_ID = '64f100000000000000000001';
const ARTICLE_ID = '64f100000000000000000021';

const stored = {
  _id: ARTICLE_ID,
  userId: USER_ID,
  title: 'A source worth keeping',
  evergreen: false,
  evergreenAt: null,
  content: '<p>Readable copy.</p>',
  highlights: [{ _id: 'highlight-1', text: 'Fetched elsewhere.' }],
  pdfs: [{ name: 'large.pdf', data: 'not-reader-data' }]
};

const documentFor = () => {
  const doc = {
    ...stored,
    save: async function save() {
      stored.evergreen = this.evergreen;
      stored.evergreenAt = this.evergreenAt;
      return this;
    }
  };
  const query = Promise.resolve(doc);
  query.select = () => query;
  query.populate = () => query;
  query.lean = async () => {
    const { highlights, pdfs, ...reader } = doc;
    return reader;
  };
  return query;
};

const Article = {
  findOne: ({ _id, userId }) => (
    String(_id) === ARTICLE_ID && String(userId) === USER_ID
      ? documentFor()
      : Promise.resolve(null)
  ),
  updateOne: async () => ({})
};

const app = express();
app.use(express.json());
app.use(buildLegacyContentRouter({
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer qa') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
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

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const request = async (path, { method = 'GET', body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: 'Bearer qa',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return { response, body: await response.json() };
  };

  try {
    const kept = await request(`/articles/${ARTICLE_ID}/evergreen`, {
      method: 'PATCH',
      body: { evergreen: true }
    });
    assert.strictEqual(kept.response.status, 200, 'Keep for good must save');
    assert.strictEqual(kept.body.evergreen, true);
    assert.ok(kept.body.evergreenAt);

    const reloaded = await request(`/articles/${ARTICLE_ID}`);
    assert.strictEqual(reloaded.response.status, 200, 'reload must still find the source');
    assert.strictEqual(reloaded.body.evergreen, true, 'Keep must survive reload');
    assert.ok(reloaded.body.evergreenAt);
    assert.strictEqual(reloaded.body.content, '<p>Readable copy.</p>');
    assert.strictEqual(reloaded.body.pdfs, undefined, 'reader response must not serialize PDF attachments');
    assert.strictEqual(reloaded.body.highlights, undefined, 'reader response must not duplicate the highlights endpoint');

    console.log('legacy content evergreen persist tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
