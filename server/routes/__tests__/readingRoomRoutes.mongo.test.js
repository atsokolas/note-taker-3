const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { buildReadingRoomRouter } = require('../readingRoomRoutes');
const { loadWorthSaying } = require('../../services/readingRoomService');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

test('real Mongo: the reading room reads only the owner\'s visible shelf, with folders and reading places', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const { Article, ArticleReadingState, Folder } = require('../../models');
    const userId = new mongoose.Types.ObjectId();
    const stranger = new mongoose.Types.ObjectId();
    const body = `<p>${'A readable paragraph about moats and margins. '.repeat(40)}</p>`;
    const feed = await Folder.create({ userId, name: 'Stratechery', asFeed: true });
    const oldest = await Article.create({ userId, url: 'https://e.com/1', title: 'The oldest unread', content: body });
    await Article.collection.updateOne({ _id: oldest._id }, { $set: { createdAt: new Date(Date.now() - 60 * 86400000) } });
    const partway = await Article.create({ userId, url: 'https://e.com/2', title: 'Halfway through', content: body });
    await ArticleReadingState.create({ userId, articleId: partway._id, anchor: { text: 'moats', startOffsetApprox: 10 }, ratio: 0.5, visitedAt: new Date() });
    const arrival = await Article.create({ userId, url: 'https://e.com/3', title: 'Fresh from the feed', content: body, folder: feed._id });
    await Article.create({ userId, url: 'https://e.com/4', title: 'Hidden import', content: body, hiddenFromHome: true });
    await Article.create({ userId: stranger, url: 'https://e.com/5', title: 'Someone else', content: body });

    const app = express();
    app.use(express.json());
    const auth = (req, _res, next) => { req.user = { id: String(userId) }; next(); };
    app.use(buildReadingRoomRouter({ auth, humanOnly: (_req, _res, next) => next(), mongoose, Article, ArticleReadingState }));
    server = await listen(app);
    const base = `http://127.0.0.1:${server.address().port}`;

    const room = await (await fetch(`${base}/api/library/reading-room?tz=0`)).json();
    assert.equal(room.pick.articleId, String(oldest._id));
    assert.deepEqual(room.stillReading.map((row) => row.title), ['Halfway through']);
    assert.deepEqual(room.newFromSources, [{ articleId: String(arrival._id), title: 'Fresh from the feed', sourceName: 'Stratechery' }]);
    assert.equal(room.weather, null);
    assert.deepEqual(room.worthSaying, []);

    const said = await (await fetch(`${base}/api/library/reading-room/said`)).json();
    assert.deepEqual(said, { said: null });

    const availability = await (await fetch(`${base}/api/articles/${oldest._id}/explain-back`)).json();
    assert.equal(typeof availability.available, 'boolean');
    assert.equal((await fetch(`${base}/api/articles/${new mongoose.Types.ObjectId()}/explain-back`)).status, 404);
    const tooShort = await fetch(`${base}/api/articles/${oldest._id}/explain-back`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Short.' })
    });
    assert.equal(tooShort.status, 400);

    await Article.updateOne({ _id: oldest._id }, { $push: { highlights: { text: 'Margins are where the moat shows up first.' } } });
    assert.equal(await loadWorthSaying({ models: { Article }, userId }), null);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
