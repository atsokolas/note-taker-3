const assert = require('assert');
const express = require('express');
const { buildLegacyContentRouter } = require('../legacyContentRoutes');

const USER_ID = '64f100000000000000000001';
const ARTICLE_ID = '64f100000000000000000021';

const stored = {
  _id: ARTICLE_ID,
  userId: USER_ID,
  title: 'A source owed a move',
  evergreen: true,
  evergreenAt: '2026-01-01T00:00:00.000Z',
  placement: 'stream',
  placementAt: null,
  placementReason: '',
  content: '<p>Readable copy.</p>'
};

const documentFor = () => {
  const doc = {
    ...stored,
    save: async function save() {
      stored.placement = this.placement;
      stored.placementAt = this.placementAt;
      stored.placementReason = this.placementReason;
      stored.evergreen = this.evergreen;
      stored.evergreenAt = this.evergreenAt;
      return this;
    }
  };
  const query = Promise.resolve(doc);
  query.select = () => query;
  query.populate = () => query;
  query.lean = async () => ({ ...doc });
  return query;
};

const Article = {
  findOne: ({ _id, userId }) => {
    if (String(_id) === ARTICLE_ID && String(userId) === USER_ID) return documentFor();
    const query = Promise.resolve(null);
    query.select = () => query;
    query.populate = () => query;
    query.lean = async () => null;
    return query;
  },
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
    const later = await request(`/articles/${ARTICLE_ID}/placement`, {
      method: 'PATCH',
      body: { placement: 'later' }
    });
    assert.strictEqual(later.response.status, 200, 'Later must save');
    assert.strictEqual(later.body.placement, 'later');
    assert.ok(later.body.placementAt);
    assert.strictEqual(later.body.evergreen, true, 'Keep stays independent');

    const aside = await request(`/articles/${ARTICLE_ID}/placement`, {
      method: 'PATCH',
      body: { placement: 'setAside', reason: 'at hand this week' }
    });
    assert.strictEqual(aside.body.placement, 'setAside');
    assert.strictEqual(aside.body.placementReason, 'at hand this week');
    assert.notStrictEqual(String(aside.body.placementAt), String(later.body.placementAt), 'a new pile gets its own date');

    const home = await request(`/articles/${ARTICLE_ID}/placement`, {
      method: 'PATCH',
      body: { placement: 'stream' }
    });
    assert.strictEqual(home.body.placement, 'stream');
    assert.strictEqual(home.body.placementAt, null);
    assert.strictEqual(home.body.placementReason, '');

    const bad = await request(`/articles/${ARTICLE_ID}/placement`, {
      method: 'PATCH',
      body: { placement: 'starred' }
    });
    assert.strictEqual(bad.response.status, 400);

    const foreign = await request('/articles/64f100000000000000000099/placement', {
      method: 'PATCH',
      body: { placement: 'later' }
    });
    assert.strictEqual(foreign.response.status, 404);

    const reloaded = await request(`/articles/${ARTICLE_ID}`);
    assert.strictEqual(reloaded.body.placement, 'stream');

    console.log('legacy content placement persist tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
