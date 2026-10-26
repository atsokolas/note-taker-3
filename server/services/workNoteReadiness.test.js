const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server');
const { NotebookEntry } = require('../models');
const { createWorkNoteReadiness } = require('./workNoteReadiness');
let replica;
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri(), { autoIndex: false });
});
after(async () => { await mongoose.disconnect(); await replica?.stop(); });
test('absent unique index is built with autoIndex:false; delayed initialization stays unavailable', async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const createIndex = NotebookEntry.collection.createIndex.bind(NotebookEntry.collection);
  NotebookEntry.collection.createIndex = async (...args) => { await wait; return createIndex(...args); };
  const readiness = createWorkNoteReadiness({ NotebookEntry });
  assert.equal(readiness.isReady(), false);
  release();
  assert.equal(await readiness.settled, true);
  NotebookEntry.collection.createIndex = createIndex;
  const indexes = await NotebookEntry.collection.indexes();
  const index = indexes.find(row => row.key.userId === 1 && row.key.operationId === 1);
  assert.equal(index.unique, true);
  assert.equal(index.partialFilterExpression.knowledgeContext, 'work');
});
test('failed index build remains unavailable', async () => {
  const createIndex = NotebookEntry.collection.createIndex;
  NotebookEntry.collection.createIndex = async () => { throw new Error('fictional unavailable index build'); };
  try {
    const readiness = createWorkNoteReadiness({ NotebookEntry });
    assert.equal(await readiness.settled, false);
    assert.equal(readiness.isReady(), false);
  } finally { NotebookEntry.collection.createIndex = createIndex; }
});
test('standalone Mongo cannot enable Work operations', async () => {
  const standalone = await MongoMemoryServer.create();
  const connection = await mongoose.createConnection(standalone.getUri(), { autoIndex: false }).asPromise();
  try {
    const Model = connection.model('StandaloneWorkNote', NotebookEntry.schema);
    const readiness = createWorkNoteReadiness({ NotebookEntry: Model });
    assert.equal(await readiness.settled, false);
    assert.equal(readiness.isReady(), false);
  } finally { await connection.close(); await standalone.stop(); }
});
