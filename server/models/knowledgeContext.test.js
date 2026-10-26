const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { NotebookEntry, NotebookFolder } = require('./index');
let mongo;
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
test('Personal queries, counts, distinct, aggregates and direct IDs exclude Work and preserve legacy', async () => {
  const userId = new mongoose.Types.ObjectId();
  for (const Model of [NotebookEntry, NotebookFolder]) {
    const field = Model === NotebookEntry ? 'title' : 'name';
    const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    await Model.collection.insertMany([
      { _id: ids[0], userId, [field]: 'legacy' },
      { _id: ids[1], userId, [field]: 'secret', knowledgeContext: 'work' }
    ]);
    assert.equal((await Model.find({ userId })).length, 1);
    assert.equal(await Model.countDocuments({ userId }), 1);
    assert.deepEqual(await Model.distinct(field, { userId }), ['legacy']);
    assert.equal((await Model.aggregate([{ $match: { userId } }])).length, 1);
    assert.equal(await Model.findById(ids[1]), null);
    assert.equal(await Model.findOneAndUpdate({ _id: ids[1] }, { $set: { [field]: 'leak' } }), null);
  }
});
test('scope capability cannot be forged and populate, raw background scan and embedding sink stay Personal', async () => {
  const { inWork } = require('./knowledgeContext');
  const { referenceProjection } = require('../services/wikiRetentionReferences');
  const { buildNotebookEmbeddingJob } = require('../ai/embeddingJobs');
  const userId = new mongoose.Types.ObjectId();
  const folder = await NotebookFolder.create({ name: 'Hidden folder', userId, knowledgeContext: 'work' });
  const secretId = new mongoose.Types.ObjectId();
  const work = await NotebookEntry.create({ title: 'Hidden', content: String(secretId), userId, folder: folder._id, knowledgeContext: 'work' });
  const personal = await NotebookEntry.create({ title: 'Visible', userId, folder: folder._id });
  assert.equal((await NotebookEntry.findById(personal._id).populate('folder')).folder, null);
  assert.equal((await NotebookEntry.find({ knowledgeContext: 'work' }).setOptions({ knowledgeContext: 'work' })).length, 0);
  assert.equal((await inWork(NotebookEntry.find({ userId }))).length, 1);
  assert.equal((await inWork(NotebookEntry.aggregate([{ $match: { userId } }]))).length, 1);
  assert.equal(buildNotebookEmbeddingJob(work), null);
  const rows = await NotebookEntry.collection.aggregate(referenceProjection('notebookentries')).toArray();
  assert.ok(!rows.some(row => row.ref === String(secretId)));
  await assert.rejects(NotebookEntry.estimatedDocumentCount(), /scoped/);
  assert.equal((await NotebookEntry.deleteMany({ _id: work._id })).deletedCount, 0);
});
test('nested aggregate joins and unions cannot reintroduce Work records', async () => {
  const userId = new mongoose.Types.ObjectId();
  const work = await NotebookEntry.create({ title: 'Joined secret', userId, knowledgeContext: 'work' });
  await NotebookEntry.create({ title: 'Personal anchor', userId });
  const union = await NotebookEntry.aggregate([{ $match: { userId } }, { $unionWith: { coll: 'notebookentries', pipeline: [{ $match: { _id: work._id } }] } }]);
  assert.equal(union.length, 1);
  const joined = await NotebookEntry.aggregate([{ $match: { userId } }, { $lookup: { from: 'notebookentries', pipeline: [{ $match: { _id: work._id } }], as: 'notes' } }]);
  assert.deepEqual(joined[0].notes, []);
});
