const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildNotebookRouter } = require('../notebookRoutes');

test('an Edition clipping keeps one editable, cited Notebook quote per owner and selection', async () => {
  const mongo = await MongoMemoryServer.create();
  let listener;
  try {
    await mongoose.connect(mongo.getUri());
    const { NotebookEntry } = require('../../models');
    const owner = String(new mongoose.Types.ObjectId());
    const other = String(new mongoose.Types.ObjectId());
    const app = express();
    app.use(express.json());
    app.use(buildNotebookRouter({
      authenticateToken: (req, _res, next) => { req.user = { id: req.get('test-user') }; next(); },
      NotebookEntry,
      normalizeItemType: (value, fallback) => value || fallback,
      normalizeTags: () => [],
      syncNotebookReferences: async () => {},
      enqueueNotebookEmbedding: () => {},
      trackEvent: () => {},
      EVENT_NAMES: {}
    }));
    await new Promise(resolve => { listener = app.listen(0, '127.0.0.1', resolve); });
    const url = `http://127.0.0.1:${listener.address().port}/api/notebook`;
    const block = {
      type: 'quote', text: 'Keep these exact words.',
      articleTitle: 'The Paper · Edition 4', sourcePath: '/editions/e4#edition-item-one'
    };
    const keep = async (user = owner, quote = block) => {
      const res = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json', 'test-user': user },
        body: JSON.stringify({ source: 'edition-selection', title: 'A distinction', blocks: [quote] })
      });
      return { status: res.status, note: await res.json() };
    };

    const results = await Promise.all([keep(), keep()]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
    const id = results[0].note._id;
    assert.equal(results[1].note._id, id);
    const stored = await NotebookEntry.findById(id).lean();
    for (const [key, value] of Object.entries(block)) assert.equal(stored.blocks[0][key], value);
    await NotebookEntry.updateOne({ _id: id }, { title: 'My own title' });
    assert.equal((await keep()).note.title, 'My own title');
    assert.notEqual((await keep(other)).note._id, id);
    assert.notEqual((await keep(owner, { ...block, text: 'Different words.' })).note._id, id);
    assert.equal((await keep(owner, { ...block, sourcePath: 'https://example.com/' })).status, 400);
    assert.equal(await NotebookEntry.countDocuments(), 3);
  } finally {
    listener?.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
