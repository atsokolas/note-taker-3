const assert = require('assert');
const express = require('express');
const { buildLegacyContentRouter } = require('../legacyContentRoutes');

const USER_ID = '64f100000000000000000001';
const FOLDER_ID = '64f100000000000000000041';
const TRAY_ID = '64f100000000000000000042';

const folders = {
  [FOLDER_ID]: {
    _id: FOLDER_ID,
    userId: USER_ID,
    name: 'Newsletters',
    asFeed: false
  },
  [TRAY_ID]: {
    _id: TRAY_ID,
    userId: USER_ID,
    name: 'Needs Review',
    asFeed: false
  }
};

const documentFor = (stored) => {
  const doc = {
    ...stored,
    save: async function save() {
      stored.asFeed = this.asFeed;
      return this;
    }
  };
  const query = Promise.resolve(doc);
  query.select = () => query;
  query.lean = async () => ({ ...stored });
  return query;
};

const Folder = {
  findOne: ({ _id, userId }) => {
    const stored = folders[String(_id)];
    if (stored && String(stored.userId) === String(userId)) return documentFor(stored);
    const missing = Promise.resolve(null);
    missing.select = () => missing;
    missing.lean = async () => null;
    return missing;
  }
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
  Folder,
  normalizePdfs: (value) => value,
  Article: { findOne: async () => null, updateOne: async () => ({}) },
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
    const screened = await request(`/folders/${FOLDER_ID}/feed`, {
      method: 'PATCH',
      body: { asFeed: true }
    });
    assert.strictEqual(screened.response.status, 200);
    assert.strictEqual(screened.body.asFeed, true);
    assert.strictEqual(folders[FOLDER_ID].asFeed, true);

    const restored = await request(`/folders/${FOLDER_ID}/feed`, {
      method: 'PATCH',
      body: { asFeed: false }
    });
    assert.strictEqual(restored.body.asFeed, false);

    const tray = await request(`/folders/${TRAY_ID}/feed`, {
      method: 'PATCH',
      body: { asFeed: true }
    });
    assert.strictEqual(tray.response.status, 400);
    assert.match(String(tray.body.error || ''), /feed|tray|procedural|review/i);
    assert.strictEqual(folders[TRAY_ID].asFeed, false);

    const missing = await request('/folders/64f100000000000000000099/feed', {
      method: 'PATCH',
      body: { asFeed: true }
    });
    assert.strictEqual(missing.response.status, 404);

    const bad = await request(`/folders/${FOLDER_ID}/feed`, {
      method: 'PATCH',
      body: { asFeed: 'yes' }
    });
    assert.strictEqual(bad.response.status, 400);

    console.log('legacy content folder feed tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
