const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { NotebookEntry } = require('./index');
const { buildNotebookRouter } = require('../routes/notebookRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

const run = async () => {
  // Local ephemeral MongoDB only. Never the application database.
  const memory = await MongoMemoryServer.create();
  await mongoose.connect(memory.getUri());
  const userId = new mongoose.Types.ObjectId();
  const entry = await NotebookEntry.create({
    userId,
    title: 'Persistence',
    content: '<p>Canonical words</p>',
    blocks: [{ id: 'p1', type: 'paragraph', text: 'Canonical words' }]
  });
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(buildNotebookRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: userId }; next(); },
    NotebookEntry,
    NotebookFolder: {},
    ReferenceEdge: {},
    ensureNotebookBlocks: () => {},
    createBlockId: () => 'block',
    stripHtml: (value) => String(value || ''),
    normalizeItemType: (value) => value,
    parseClaimId: () => null,
    normalizeTags: (value) => value || [],
    syncNotebookReferences: async () => {},
    enqueueNotebookEmbedding: () => {},
    trackEvent: () => {},
    EVENT_NAMES: {},
    findHighlightById: async () => null
  }));
  const { server, url } = await listen(app);
  const put = (body) => fetch(`${url}/api/notebook/${entry._id}/workbench`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  try {
    const saved = await put({
      expectedRevision: 0,
      workingState: {
        trials: [
          {
            id: 't1',
            target: { blockId: 'p1', baseText: 'Canonical words', scope: 'range', rangeStart: 10, rangeEnd: 15 },
            alternative: 'language',
            origin: 'partner',
            partnerExplanation: 'More direct.'
          },
          {
            id: 't2',
            target: { blockId: 'p1', baseText: 'Canonical words' },
            alternative: 'Tighter words',
            intent: 'tighter'
          }
        ]
      }
    });
    assert.equal(saved.status, 200);
    const raw = await NotebookEntry.collection.findOne({ _id: entry._id });
    assert.equal(raw.workingState.revision, 1);
    assert.equal(raw.workingState.trials[0].partnerExplanation, 'More direct.');
    assert.equal(raw.workingState.trials[0].target.scope, 'range');
    assert.equal(raw.workingState.trials[0].target.rangeStart, 10);
    assert.equal(raw.workingState.trials[0].target.rangeEnd, 15);
    assert.equal(raw.workingState.trials[1].intent, 'tighter');
    assert.equal(raw.title, 'Persistence');

    const reloaded = await NotebookEntry.findById(entry._id);
    assert.equal(reloaded.workingState.trials[0].partnerExplanation, 'More direct.');
    assert.equal(reloaded.workingState.trials[1].intent, 'tighter');
    assert.equal(reloaded.workingState.trials[0].target.scope, 'range');

    const stale = await put({ expectedRevision: 0, workingState: { trials: [] } });
    assert.equal(stale.status, 409);
    const conflict = await stale.json();
    assert.equal(conflict.code, 'workbench_conflict');
    const untouched = await NotebookEntry.collection.findOne({ _id: entry._id });
    assert.equal(untouched.workingState.revision, 1);
    assert.equal(untouched.workingState.trials[0].partnerExplanation, 'More direct.');
    assert.equal(untouched.workingState.trials[1].intent, 'tighter');
    assert.equal(untouched.workingState.trials.length, 2);
    console.log('notebook workbench persistence ok');
  } finally {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await memory.stop();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
