const assert = require('assert');
const express = require('express');
const { buildStickyRouter } = require('../stickyRoutes');

const USER_ID = '64f100000000000000000001';
const OTHER_ID = '64f100000000000000000002';

let seq = 0;
const store = new Map();

const Sticky = {
  find: (query) => {
    const rows = [...store.values()].filter(row =>
      String(row.userId) === String(query.userId)
      && (!query.targetType || row.targetType === query.targetType)
      && (!query.targetId || row.targetId === query.targetId)
      && (!query.status || row.status === query.status)
    ).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return {
      sort: () => ({ lean: async () => rows.map(row => ({ ...row })) })
    };
  },
  create: async (doc) => {
    seq += 1;
    const row = {
      _id: `sticky-${seq}`,
      createdAt: new Date().toISOString(),
      ...doc
    };
    store.set(row._id, row);
    return { ...row };
  },
  findOneAndDelete: async ({ _id, userId }) => {
    const row = store.get(String(_id));
    if (!row || String(row.userId) !== String(userId)) return null;
    store.delete(String(_id));
    return { ...row };
  }
};

const app = express();
app.use(express.json());
app.use(buildStickyRouter({
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer qa') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: req.headers['x-user'] || USER_ID };
    return next();
  },
  Sticky
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const request = async (path, { method = 'GET', body, user } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: 'Bearer qa',
        ...(user ? { 'x-user': user } : {}),
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return { response, body: await response.json() };
  };

  try {
    const created = await request('/api/stickies', {
      method: 'POST',
      body: { text: 'Ask him about Thursday.', targetType: 'article', targetId: 'a1', targetTitle: 'The letter' }
    });
    assert.strictEqual(created.response.status, 201);
    assert.strictEqual(created.body.text, 'Ask him about Thursday.');
    assert.strictEqual(created.body.status, 'pending');
    const id = created.body._id;

    const listed = await request('/api/stickies?targetType=article&targetId=a1');
    assert.strictEqual(listed.response.status, 200);
    assert.strictEqual(listed.body.length, 1);

    const empty = await request('/api/stickies', {
      method: 'POST',
      body: { text: '   ', targetType: 'article', targetId: 'a1' }
    });
    assert.strictEqual(empty.response.status, 400);

    const long = await request('/api/stickies', {
      method: 'POST',
      body: { text: 'x'.repeat(141), targetType: 'article', targetId: 'a1' }
    });
    assert.strictEqual(long.response.status, 400);

    const badTarget = await request('/api/stickies', {
      method: 'POST',
      body: { text: 'A line.', targetType: 'drawer', targetId: 'a1' }
    });
    assert.strictEqual(badTarget.response.status, 400);

    const foreign = await request(`/api/stickies/${id}`, { method: 'DELETE', user: OTHER_ID });
    assert.strictEqual(foreign.response.status, 404);

    const removed = await request(`/api/stickies/${id}`, { method: 'DELETE' });
    assert.strictEqual(removed.response.status, 200);
    assert.strictEqual(removed.body.deleted, true);

    const relisted = await request('/api/stickies?targetType=article&targetId=a1');
    assert.strictEqual(relisted.body.length, 0);

    console.log('sticky routes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
