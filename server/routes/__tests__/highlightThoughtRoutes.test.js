const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildHighlightMutationRouter } = require('../highlightMutationRoutes');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

test('real Mongo: conditional thoughts preserve reader edits, concurrent retry and reconnect receipts', async () => {
  const cached = require('node:path').join(require('node:os').homedir(), '.cache/mongodb-binaries/mongod-arm64-darwin-8.2.6');
  const mongo = await MongoMemoryServer.create({ binary: require('node:fs').existsSync(cached) ? { systemBinary: cached, version: '8.2.6' } : undefined });
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const { Article } = require('../../models');
    const userId = new mongoose.Types.ObjectId();
    const article = await Article.create({ userId, url: 'https://example.com/source', title: 'Source', highlights: [{ text: 'Exact author passage.', note: 'Reader A' }] });
    const highlightId = String(article.highlights[0]._id);
    const app = express(); app.use(express.json());
    let heldRead = null;
    const routeArticle = {
      findOne: async query => {
        const document = await Article.findOne(query);
        if (heldRead) {
          const hold = heldRead; heldRead = null;
          hold.loaded(); await hold.wait;
        }
        return document;
      },
      findOneAndUpdate: (...args) => Article.findOneAndUpdate(...args)
    };
    app.use(buildHighlightMutationRouter({ mongoose, Article: routeArticle,
      authenticateToken: (req, res, next) => { req.user = { id: req.headers['x-user'] || String(userId) }; next(); },
      normalizeTags: value => value || [], normalizeItemType: (value, fallback) => value || fallback,
      parseClaimId: value => value, enqueueHighlightEmbedding: () => {}, safeMapEmbedding: () => null,
      highlightToEmbeddingItem: () => null, queueEmbeddingUpsert: () => {}, markTourSignal: async () => {},
      buildEmbeddingId: () => '', queueEmbeddingDelete: () => {}
    }));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const endpoint = `http://127.0.0.1:${server.address().port}/articles/${article._id}/highlights/${highlightId}`;
    const call = async (body, method = 'POST', user) => {
      const result = await fetch(endpoint + (method === 'POST' ? '/thoughts' : ''), { method, headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': user } : {}) }, body: JSON.stringify(body) });
      return { status: result.status, body: await result.json() };
    };
    const snapshot = { expectedNoteHash: hash('Reader A'), expectedNoteRevision: 0, expectedPassageHash: hash('Exact author passage.'), explicitlyRequested: true };
    const body = { ...snapshot, thought: 'New explicitly requested thought', operationId: crypto.randomUUID() };
    assert.equal((await call({ note: 'Reader B' }, 'PATCH')).status, 200);
    assert.equal((await call(body)).status, 409);
    let current = await Article.findById(article._id);
    assert.equal(current.highlights.id(highlightId).note, 'Reader B');
    assert.equal(current.highlights.id(highlightId).thoughtOperations.length, 0);
    const retryBody = { ...body, expectedNoteHash: hash('Reader B'), expectedNoteRevision: 1 };
    const simultaneous = await Promise.all([call(retryBody), call(retryBody), call(retryBody)]);
    assert.ok(simultaneous.every(result => result.status === 200));
    assert.deepEqual(simultaneous[0].body, simultaneous[1].body);
    current = await Article.findById(article._id);
    assert.equal(current.highlights.id(highlightId).note, 'Reader B\n\nNew explicitly requested thought');
    assert.equal(current.highlights.id(highlightId).thoughtOperations.length, 1);
    const receipt = simultaneous[0].body;
    assert.equal((await call({ note: 'Later reader edit' }, 'PATCH')).status, 200);
    await mongoose.disconnect(); await mongoose.connect(mongo.getUri());
    assert.deepEqual((await call(retryBody)).body, receipt);
    current = await Article.findById(article._id);
    assert.equal(current.highlights.id(highlightId).note, 'Later reader edit');
    assert.equal(current.highlights.id(highlightId).thoughtOperations.length, 1);
    assert.equal((await call({ ...retryBody, thought: 'Different request' })).status, 409);
    assert.equal((await call(retryBody, 'POST', String(new mongoose.Types.ObjectId()))).status, 404);
    assert.equal((await call({ ...retryBody, operationId: crypto.randomUUID(), explicitlyRequested: false })).status, 400);
    // Two different saves sharing one snapshot cannot both append.
    const latest = { ...snapshot, expectedNoteHash: hash('Later reader edit'), expectedNoteRevision: 3 };
    const race = await Promise.all([call({ ...latest, thought: 'One', operationId: crypto.randomUUID() }), call({ ...latest, thought: 'Two', operationId: crypto.randomUUID() })]);
    assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
    // A human PATCH loaded before the append cannot save its stale note later.
    current = await Article.findById(article._id);
    const before = current.highlights.id(highlightId);
    let loaded, release;
    const loadedPromise = new Promise(resolve => { loaded = resolve; });
    const wait = new Promise(resolve => { release = resolve; });
    heldRead = { loaded, wait };
    const humanEdit = call({ note: 'Stale in-flight human assignment' }, 'PATCH');
    await loadedPromise;
    const newThought = { ...snapshot, expectedNoteHash: hash(before.note), expectedNoteRevision: before.noteRevision, thought: 'Atomic concurrent thought', operationId: crypto.randomUUID() };
    assert.equal((await call(newThought)).status, 200);
    release();
    assert.equal((await humanEdit).status, 409);
    current = await Article.findById(article._id);
    assert.equal(current.highlights.id(highlightId).note, `${before.note}\n\nAtomic concurrent thought`);
    assert.equal(current.highlights.id(highlightId).thoughtOperations.length, 3);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await mongo.stop();
  }
});
