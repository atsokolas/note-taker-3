const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { takeSharesDown } = require('./accountShares');

test('real Mongo: a closed account shares nothing, and other accounts keep theirs', async () => {
  const memory = await MongoMemoryServer.create();
  try {
    await mongoose.connect(memory.getUri());
    const models = require('../models');
    const [closing, staying] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    for (const [userId, slug] of [[closing, 'a'], [staying, 'b']]) {
      await models.WikiPage.collection.insertOne({ userId, title: 'Page', slug, visibility: 'shared' });
      await models.WikiSharedCollection.collection.insertOne({ userId, name: 'Set', slug, visibility: 'shared' });
      await models.Article.collection.insertOne({ userId, url: `import://book/${slug}`, title: 'Book', lentAs: `lent-${slug}` });
      await models.SharedEdition.collection.insertOne({ userId, slug: `edition-${slug}` });
    }
    await takeSharesDown({ models, userId: closing });
    const of = async (Model, userId) => Model.collection.findOne({ userId });
    assert.equal((await of(models.WikiPage, closing)).visibility, 'private');
    assert.equal((await of(models.WikiSharedCollection, closing)).visibility, 'private');
    assert.equal((await of(models.Article, closing)).lentAs, '');
    assert.equal(await of(models.SharedEdition, closing), null);
    assert.equal((await of(models.WikiPage, staying)).visibility, 'shared');
    assert.equal((await of(models.Article, staying)).lentAs, 'lent-b');
    assert.ok(await of(models.SharedEdition, staying));
  } finally {
    await mongoose.disconnect();
    await memory.stop();
  }
});
