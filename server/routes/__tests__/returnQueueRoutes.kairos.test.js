const assert = require('assert');
const express = require('express');
const { buildReturnQueueRouter } = require('../returnQueueRoutes');

const USER_ID = '64f100000000000000000001';
const ARTICLE_ID = '64f100000000000000000021';
const OTHER_ID = '64f100000000000000000022';

const rows = [];
let created = 0;

const asDoc = (plain) => ({
  ...plain,
  toObject() {
    const { toObject, save, ...rest } = this;
    return rest;
  },
  async save() {
    const index = rows.findIndex((row) => String(row._id) === String(this._id));
    Object.assign(plain, this);
    if (index >= 0) rows[index] = asDoc(plain);
    return this;
  }
});

const mongoMatch = (doc, query = {}) => Object.entries(query).every(([key, value]) => {
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    if ('$or' === key) return false;
    if ('$in' in value) return value.$in.map(String).includes(String(doc[key]));
    if ('$gt' in value) return new Date(doc[key] || 0) > new Date(value.$gt);
    if ('$lte' in value) return new Date(doc[key] || 0) <= new Date(value.$lte);
  }
  return String(doc[key] ?? '') === String(value ?? '');
});

const ReturnQueueEntry = {
  create: async (doc) => {
    created += 1;
    const row = asDoc({
      ...doc,
      _id: `64f1000000000000000000${String(30 + rows.length).padStart(2, '0')}`,
      cadence: doc.cadence || null,
      lastFiredOn: doc.lastFiredOn || '',
      fired: doc.fired || null
    });
    rows.push(row);
    return row;
  },
  find: (query = {}) => {
    const matched = rows.filter((row) => mongoMatch(row, query));
    const result = Promise.resolve(matched.map((row) => row.toObject()));
    result.sort = () => result;
    result.limit = () => result;
    result.lean = async () => matched.map((row) => row.toObject());
    return result;
  },
  findOne: async (query = {}) => rows.find((row) => mongoMatch(row, query)) || null
};

const app = express();
app.use(express.json());
app.use(buildReturnQueueRouter({
  mongoose: {
    Types: { ObjectId: { isValid: (id) => /^[a-f0-9]{24}$/i.test(String(id)) } }
  },
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer qa') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: USER_ID };
    return next();
  },
  ReturnQueueEntry,
  normalizeReturnQueueItemType: (value) => String(value || '').trim().toLowerCase(),
  parseDueAt: (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },
  resolveReturnQueueItem: async (_userId, itemType, itemId) => {
    if (itemType === 'article' && [ARTICLE_ID, OTHER_ID].includes(String(itemId))) {
      return { title: 'The Costco 10-K', openPath: `/library?articleId=${itemId}`, exists: true };
    }
    return null;
  },
  buildUnavailableQueueItem: () => ({ title: 'Unavailable', exists: false }),
  trackEvent: () => {},
  EVENT_NAMES: { REVISIT_SCHEDULED: 'revisit_scheduled' }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const request = async (path, { method = 'GET', body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: 'Bearer qa', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch (_error) { /* text */ }
    return { status: response.status, body: parsed };
  };

  try {
    const daily = await request('/api/return-queue', {
      method: 'POST',
      body: { itemType: 'article', itemId: ARTICLE_ID, cadence: 'daily', dueAt: '2026-09-01T09:00:00.000Z' }
    });
    assert.strictEqual(daily.status, 400);
    assert.match(daily.body.error, /daily/i);

    const first = await request('/api/return-queue', {
      method: 'POST',
      body: {
        itemType: 'article',
        itemId: ARTICLE_ID,
        reason: 'the margin note on returns',
        dueAt: '2026-09-01T09:00:00.000Z',
        cadence: 'weekly'
      }
    });
    assert.strictEqual(first.status, 201);
    assert.strictEqual(first.body.itemType, 'article');
    assert.strictEqual(first.body.cadence, 'weekly');
    assert.strictEqual(first.body.status, 'pending');
    const queueId = first.body._id;

    const replaced = await request('/api/return-queue', {
      method: 'POST',
      body: {
        itemType: 'article',
        itemId: ARTICLE_ID,
        reason: 'a newer promise',
        dueAt: '2026-09-07T09:00:00.000Z',
        cadence: null
      }
    });
    assert.strictEqual(replaced.status, 200);
    assert.strictEqual(replaced.body._id, queueId);
    assert.strictEqual(replaced.body.reason, 'a newer promise');
    assert.strictEqual(replaced.body.cadence, null);
    assert.strictEqual(created, 1);

    const lookup = await request(`/api/return-queue?filter=all&itemType=article&itemId=${ARTICLE_ID}`);
    assert.strictEqual(lookup.status, 200);
    assert.strictEqual(lookup.body.length, 1);
    assert.strictEqual(lookup.body[0].reason, 'a newer promise');

    const other = await request('/api/return-queue', {
      method: 'POST',
      body: { itemType: 'article', itemId: OTHER_ID, dueAt: '2026-09-02T09:00:00.000Z' }
    });
    assert.strictEqual(other.status, 201);
    assert.notStrictEqual(other.body._id, queueId);

    const cleared = await request(`/api/return-queue/${queueId}`, {
      method: 'PATCH',
      body: { action: 'done' }
    });
    assert.strictEqual(cleared.status, 200);
    assert.strictEqual(cleared.body.status, 'completed');

    const afterClear = await request(`/api/return-queue?filter=all&itemType=article&itemId=${ARTICLE_ID}`);
    assert.strictEqual(afterClear.body.filter((row) => row.status === 'pending').length, 0);

    const invalidCadence = await request('/api/return-queue', {
      method: 'POST',
      body: { itemType: 'article', itemId: OTHER_ID, cadence: 'hourly' }
    });
    assert.strictEqual(invalidCadence.status, 400);

    console.log('returnQueueRoutes.kairos tests passed');
    server.close();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    server.close();
  }
});
