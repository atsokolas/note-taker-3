const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { buildNotebookRouter } = require('../notebookRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

test('real Mongo: moving a note on the board files it without touching the writing', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  let server;
  let url;
  try {
    await mongoose.connect(mongo.getUri());
    const { NotebookEntry } = require('../../models');
    const userId = new mongoose.Types.ObjectId();
    const stranger = new mongoose.Types.ObjectId();
    const essay = await NotebookEntry.create({ userId, title: 'On moats', blocks: [{ id: 'p1', type: 'paragraph', text: 'Prices stay low.' }] });
    const theirs = await NotebookEntry.create({ userId: stranger, title: 'Not yours' });
    // A note written before the board existed has no board at all.
    const legacy = await NotebookEntry.collection.insertOne({ userId, title: 'Older', blocks: [], createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01') });
    assert.equal(essay.board.stage, 'idea', 'a new note starts as an idea');

    const app = express();
    app.use(express.json());
    app.use(buildNotebookRouter({
      authenticateToken: (req, _res, next) => { req.user = { id: String(userId) }; next(); },
      NotebookEntry
    }));
    ({ server, url } = await listen(app));
    const move = async (id, body) => {
      const response = await fetch(`${url}/api/notebook/${id}/board`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: response.status, body: await response.json() };
    };

    const writtenAt = essay.updatedAt.getTime();
    const started = await move(essay._id, { stage: 'in_progress' });
    assert.equal(started.status, 200);
    assert.equal(started.body.board.stage, 'in_progress');
    assert.ok(started.body.board.movedAt);

    const done = await move(essay._id, { stage: 'done', archived: true });
    assert.equal(done.body.board.stage, 'done');
    assert.ok(done.body.board.archivedAt, 'archiving keeps the stage it was set down from');
    let stored = await NotebookEntry.findById(essay._id).lean();
    assert.equal(stored.updatedAt.getTime(), writtenAt, 'filing is not writing: updatedAt stays where the writer left it');
    assert.equal(stored.blocks[0].text, 'Prices stay low.');

    const restored = await move(essay._id, { archived: false });
    assert.equal(restored.body.board.archivedAt, null);
    assert.equal(restored.body.board.stage, 'done');

    const older = await move(legacy.insertedId, { stage: 'done' });
    assert.equal(older.status, 200, 'a note from before the board can be filed');
    stored = await NotebookEntry.findById(legacy.insertedId).lean();
    assert.equal(stored.updatedAt.getTime(), new Date('2026-08-01').getTime());

    assert.equal((await move(theirs._id, { stage: 'done' })).status, 404, 'another writer’s note is not found');
    assert.equal((await move('not-an-id', { stage: 'done' })).status, 404);
    assert.equal((await move(essay._id, { stage: 'shipped' })).status, 400);
    assert.equal((await move(essay._id, { archived: 'yes' })).status, 400);
    assert.equal((await move(essay._id, {})).status, 400);
    assert.equal((await NotebookEntry.findById(theirs._id).lean()).board.stage, 'idea');

    const shelf = await fetch(`${url}/api/notebook?summary=1&compact=1`).then(response => response.json());
    const byTitle = Object.fromEntries(shelf.map(row => [row.title, row]));
    assert.equal(byTitle['On moats'].board.stage, 'done', 'the shelf summary carries where each note stands');
    assert.equal(byTitle.Older.board.stage, 'done');
  } finally {
    server?.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
