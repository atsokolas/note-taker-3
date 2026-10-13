const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { WikiPage } = require('../../models');
const { duePageQuery } = require('../wikiScheduledMaintenanceWorker');
const reviewerId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ordinaryId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
let mongo;
test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { autoIndex: false, autoCreate: false });
  await WikiPage.collection.insertMany([reviewerId, ordinaryId].map(userId => ({
    userId: new mongoose.Types.ObjectId(userId), status: 'draft', visibility: 'private',
    title: 'Offline synthetic page', slug: 'offline-page', createdFrom: { label: 'offline-fixture' }
  })));
});
test.after(async () => { await mongoose.disconnect(); await mongo.stop(); });
test('real Mongo selection excludes only the configured reviewer ObjectId', async () => {
  const pages = await WikiPage.find(duePageQuery({ target: { userId: reviewerId } })).select('userId').lean();
  assert.deepEqual(pages.map(page => String(page.userId)), [ordinaryId]);
});
test('inactive or invalid policy preserves both owners in real Mongo selection', async () => {
  for (const userId of ['', 'invalid']) {
    const pages = await WikiPage.find(duePageQuery({ target: { userId } })).select('userId').lean();
    assert.deepEqual(pages.map(page => String(page.userId)).sort(), [reviewerId, ordinaryId]);
  }
});
