const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { buildRetiredShareRouter } = require('./retiredShareRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

test('real Mongo: an old Think share link opens the shared settled page, or says it is no longer shared', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const { SharedConcept, SharedNotebook, TagMeta, WikiPage } = require('../models');
    const userId = new mongoose.Types.ObjectId();
    const [settledNote, privateNote, unsettledNote] = [0, 1, 2].map(() => new mongoose.Types.ObjectId());
    await SharedNotebook.create([
      { userId, notebookId: settledNote, slug: 'settled-and-shared' },
      { userId, notebookId: privateNote, slug: 'settled-but-private' },
      { userId, notebookId: unsettledNote, slug: 'never-settled' }
    ]);
    const shared = await WikiPage.create({
      userId, title: 'Why moats erode', slug: 'why-moats-erode', status: 'published', visibility: 'shared',
      createdFrom: { type: 'notebook', objectId: settledNote, label: `settled-note:${settledNote}` }
    });
    await WikiPage.create({
      userId, title: 'Kept private', slug: 'kept-private', status: 'published', visibility: 'private',
      createdFrom: { type: 'notebook', objectId: privateNote, label: `settled-note:${privateNote}` }
    });

    const concept = await TagMeta.create({ userId, name: 'Durable advantage' });
    const unsettledConcept = await TagMeta.create({ userId, name: 'Not settled' });
    await SharedConcept.create([
      { userId, conceptName: 'Durable advantage', slug: 'concept-settled' },
      { userId, conceptName: unsettledConcept.name, slug: 'concept-unsettled' },
      { userId, conceptName: 'Deleted since', slug: 'concept-gone' }
    ]);
    const conceptPage = await WikiPage.create({
      userId, title: 'Durable advantage', slug: 'durable-advantage', status: 'published', visibility: 'shared',
      createdFrom: { type: 'concept', objectId: concept._id, label: `settled-concept:${concept._id}` }
    });

    const app = express();
    app.use(buildRetiredShareRouter({ SharedNotebook, SharedConcept, TagMeta, WikiPage }));
    let url;
    ({ server, url } = await listen(app));
    const resolve = async (path) => {
      const response = await fetch(`${url}/api/public/retired/${path}`);
      return { status: response.status, body: await response.json() };
    };

    assert.deepEqual(await resolve('notebooks/settled-and-shared'), { status: 200, body: { to: `/share/wiki/${shared._id}` } });
    assert.deepEqual(await resolve('concepts/concept-settled'), { status: 200, body: { to: `/share/wiki/${conceptPage._id}` } });
    for (const path of ['notebooks/settled-but-private', 'notebooks/never-settled', 'notebooks/no-such-slug', 'concepts/concept-unsettled', 'concepts/concept-gone', 'volumes/any-volume']) {
      assert.deepEqual(await resolve(path), { status: 410, body: { error: 'This piece is no longer shared here.' } }, path);
    }

    await mongoose.disconnect();
    assert.equal((await resolve('notebooks/settled-and-shared')).status, 410, 'a failing store is still the calm line, never a 500');
  } finally {
    server?.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
