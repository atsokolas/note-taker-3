const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { readingMinutes, waitingTonight } = require('../nightstand');
const { buildLibraryCollectionRouter } = require('../../routes/libraryCollectionRoutes');

const words = (count) => 'words '.repeat(count);

test('real Mongo: the nightstand is sized in minutes, and tonight is the longest-waiting short piece', async () => {
  const memory = await MongoMemoryServer.create();
  let server;
  try {
    await mongoose.connect(memory.getUri());
    const { Article, ArticleReadingState } = require('../../models');
    const userId = new mongoose.Types.ObjectId();
    const day = (n) => new Date(Date.UTC(2026, 9, n));

    // Nothing waiting is silence.
    assert.equal(await waitingTonight({ Article, userId }), null);

    await Article.create([
      { userId, title: 'The Long Read on Chips', url: 'https://x.example/long', content: words(45 * 230), placement: 'later', placementAt: day(1) },
      { userId, title: 'The Shape of Attention', url: 'https://x.example/short', content: words(9 * 230), placement: 'later', placementAt: day(3), placementReason: 'Sam sent this' },
      { userId, title: 'A Newer Short One', url: 'https://x.example/newer', content: words(4 * 230), placement: 'later', placementAt: day(9) },
      { userId, title: 'Already Read', url: 'https://x.example/read', content: words(2 * 230), placement: 'stream' }
    ]);

    assert.equal(readingMinutes(0), 1, 'a piece is never zero minutes');
    assert.deepEqual(
      await waitingTonight({ Article, userId: String(userId) }),
      { articleId: String((await Article.findOne({ url: 'https://x.example/short' }))._id), title: 'The Shape of Attention', reason: 'Sam sent this', minutes: 9 }
    );

    const app = express();
    app.use(buildLibraryCollectionRouter({
      auth: (req, _res, next) => { req.user = { id: String(userId) }; next(); },
      humanOnly: (_req, _res, next) => next(),
      mongoose,
      Article,
      ArticleReadingState
    }));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const get = async (query) => (await fetch(`http://127.0.0.1:${server.address().port}/api/library/collection?${query}`)).json();

    // Rows carry minutes and why, without the text being sent.
    const { items } = await get('scope=later&sort=oldest');
    assert.deepEqual(items.map(row => [row.title, row.minutes]), [
      ['The Long Read on Chips', 45],
      ['The Shape of Attention', 9],
      ['A Newer Short One', 4]
    ]);
    assert.equal(items[1].placementReason, 'Sam sent this');
    assert.equal(new Date(items[0].placementAt).toISOString(), day(1).toISOString());
    assert.equal(items[0].content, undefined);
    // Search loads the text to match it and still sizes the row.
    const found = await get('scope=later&query=word');
    assert.equal(found.items.length, 3);
    assert.ok(found.items.every(row => row.minutes >= 4));
  } finally {
    server?.close();
    await mongoose.disconnect();
    await memory.stop();
  }
});
