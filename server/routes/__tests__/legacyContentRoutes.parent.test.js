const assert = require('assert');
const express = require('express');
const { buildLegacyContentRouter } = require('../legacyContentRoutes');

const USER_ID = '64f100000000000000000001';
const OTHER_ID = '64f100000000000000000002';
const INVESTING = '64f100000000000000000051';
const COSTCO = '64f100000000000000000052';
const KIRKLAND = '64f100000000000000000053';
const MACRO = '64f100000000000000000054';
const TRAY_ID = '64f100000000000000000055';
const FOREIGN = '64f100000000000000000056';

const folders = {
  [INVESTING]: { _id: INVESTING, userId: USER_ID, name: 'Investing', parentFolderId: null },
  [COSTCO]: { _id: COSTCO, userId: USER_ID, name: 'Costco', parentFolderId: INVESTING },
  [KIRKLAND]: { _id: KIRKLAND, userId: USER_ID, name: 'Kirkland', parentFolderId: COSTCO },
  [MACRO]: { _id: MACRO, userId: USER_ID, name: 'Macro', parentFolderId: null },
  [TRAY_ID]: { _id: TRAY_ID, userId: USER_ID, name: 'Needs Review', parentFolderId: null },
  [FOREIGN]: { _id: FOREIGN, userId: OTHER_ID, name: 'Theirs', parentFolderId: null }
};

const documentFor = (stored) => {
  const doc = {
    ...stored,
    save: async function save() {
      stored.parentFolderId = this.parentFolderId ?? null;
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
    const nested = await request(`/folders/${MACRO}/parent`, {
      method: 'PATCH',
      body: { parentFolderId: INVESTING }
    });
    assert.strictEqual(nested.response.status, 200);
    assert.strictEqual(nested.body.parentFolderId, INVESTING);
    assert.strictEqual(folders[MACRO].parentFolderId, INVESTING);

    const homed = await request(`/folders/${COSTCO}/parent`, {
      method: 'PATCH',
      body: { parentFolderId: null }
    });
    assert.strictEqual(homed.response.status, 200);
    assert.strictEqual(homed.body.parentFolderId, null);
    assert.strictEqual(folders[COSTCO].parentFolderId, null);

    const self = await request(`/folders/${MACRO}/parent`, {
      method: 'PATCH',
      body: { parentFolderId: MACRO }
    });
    assert.strictEqual(self.response.status, 400);

    /* Kirkland lives inside Costco which lives inside Investing: moving
       Investing under Kirkland would hang the cabinet walk. */
    folders[COSTCO].parentFolderId = INVESTING;
    const cycle = await request(`/folders/${INVESTING}/parent`, {
      method: 'PATCH',
      body: { parentFolderId: KIRKLAND }
    });
    assert.strictEqual(cycle.response.status, 400);
    assert.strictEqual(folders[INVESTING].parentFolderId, null);

    const trayChild = await request(`/folders/${TRAY_ID}/parent`, {
      method: 'PATCH',
      body: { parentFolderId: INVESTING }
    });
    assert.strictEqual(trayChild.response.status, 400);

    const trayParent = await request(`/folders/${MACRO}/parent`, {
      method: 'PATCH',
      body: { parentFolderId: TRAY_ID }
    });
    assert.strictEqual(trayParent.response.status, 400);
    assert.strictEqual(folders[MACRO].parentFolderId, INVESTING);

    const missing = await request(`/folders/${MACRO}/parent`, {
      method: 'PATCH',
      body: { parentFolderId: '64f100000000000000000099' }
    });
    assert.strictEqual(missing.response.status, 404);

    const foreign = await request(`/folders/${FOREIGN}/parent`, {
      method: 'PATCH',
      body: { parentFolderId: INVESTING }
    });
    assert.strictEqual(foreign.response.status, 404);

    console.log('legacy content folder parent tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
