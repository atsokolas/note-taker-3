const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { buildArticleReadingStateRouter } = require('./articleReadingStateRoutes');

test('real Mongo: passage opens deepen, and Open source records a dead original only on 404/410, once a day', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const { Article, ArticleReadingState } = require('../models');
    await Article.createCollection();
    const userId = new mongoose.Types.ObjectId();
    const stranger = new mongoose.Types.ObjectId();
    const article = await Article.create({
      userId,
      url: 'https://example.com/essay',
      title: 'Essay',
      highlights: [{ text: 'A line worth keeping.' }]
    });
    const highlightId = String(article.highlights[0]._id);
    const statuses = [404, 200, 503];
    const checked = [];
    const app = express();
    app.use(express.json());
    const as = (id) => (req, _res, next) => { req.user = { id: String(req.get('x-user') || id) }; next(); };
    app.use(buildArticleReadingStateRouter({
      auth: as(userId),
      humanOnly: (_req, _res, next) => next(),
      Article,
      ArticleReadingState,
      checkStatus: async ({ url }) => { checked.push(url); return statuses.shift(); }
    }));
    server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (path, user = userId) => fetch(`${base}${path}`, { method: 'POST', headers: { 'x-user': String(user) } });

    assert.equal((await post(`/api/articles/${article._id}/highlights/${highlightId}/opened`)).status, 204);
    await post(`/api/articles/${article._id}/highlights/${highlightId}/opened`);
    assert.equal((await post(`/api/articles/${article._id}/highlights/${highlightId}/opened`, stranger)).status, 404);
    assert.equal((await post(`/api/articles/${article._id}/highlights/${new mongoose.Types.ObjectId()}/opened`)).status, 404);
    assert.equal((await post(`/api/articles/not-an-id/highlights/${highlightId}/opened`)).status, 404);
    let saved = await Article.findById(article._id).lean();
    assert.equal(saved.highlights[0].opens, 2);

    const gone = await (await post(`/api/articles/${article._id}/source-check`)).json();
    assert.ok(gone.sourceGoneAt, 'a 404 records the original as gone');
    const again = await (await post(`/api/articles/${article._id}/source-check`)).json();
    assert.ok(again.sourceGoneAt, 'within a day the stored answer stands');
    assert.deepEqual(checked, ['https://example.com/essay'], 'one HEAD a day, no more');

    await Article.updateOne({ _id: article._id }, { $set: { sourceCheckedAt: new Date(Date.now() - 2 * 86400000) } }, { timestamps: false });
    const back = await (await post(`/api/articles/${article._id}/source-check`)).json();
    assert.equal(back.sourceGoneAt, null, 'a success clears it');

    await Article.updateOne({ _id: article._id }, { $set: { sourceCheckedAt: null, sourceGoneAt: new Date() } }, { timestamps: false });
    const unsure = await (await post(`/api/articles/${article._id}/source-check`)).json();
    assert.ok(unsure.sourceGoneAt, 'a 503 is not proof either way');

    assert.equal((await post(`/api/articles/${article._id}/source-check`, stranger)).status, 404);
    saved = await Article.findById(article._id).lean();
    assert.ok(saved.updatedAt.getTime() === article.updatedAt.getTime(), 'checking is not editing');
  } finally {
    server?.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
