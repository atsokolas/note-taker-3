const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { FIELD, packRevisionHistories, revisionHistoryArchivePlugin } = require('./wikiRevisionHistoryArchive');

async function run() {
  // Deliberately local-only. Never use the application's production URI.
  await mongoose.connect('mongodb://127.0.0.1:27146/noeis_archive_acceptance');
  const schema = new mongoose.Schema({ before: Object, after: Object, summary: String });
  schema.plugin(revisionHistoryArchivePlugin);
  const Model = mongoose.model('ArchiveAcceptance', schema);
  const original = { _id: new mongoose.Types.ObjectId(), summary: 'metadata',
    before: { secret: 'private', claims: [{ claimId: 'one', support: 'partial', history: [{ at: new Date(), event: 'created' }] }] },
    after: { plainText: 'article', claims: [{ claimId: 'one', support: 'supported', history: [{ event: 'updated', text: 'private history' }] }] } };
  await Model.collection.insertOne(packRevisionHistories(original));
  try {
    assert.deepEqual(await Model.findById(original._id).lean(), original);
    const doc = await Model.findById(original._id);
    assert.deepEqual(doc.toObject(), original);
    doc.summary = 'metadata changed';
    await doc.save();
    const stored = await Model.collection.findOne({ _id: original._id });
    assert(stored[FIELD]);
    assert.equal(stored.before.claims[0].history, null, 'metadata save must not re-inflate histories');
    const projected = await Model.findById(original._id).select('after.claims.support -_id').lean();
    assert.deepEqual(projected, { after: { claims: [{ support: 'supported' }] } });
    let wireProjection;
    mongoose.set('debug', (collection, method, query, options) => {
      if (method === 'findOne') wireProjection = options?.projection;
    });
    await Model.findById(original._id).select('after.plainText -_id').lean();
    mongoose.set('debug', false);
    assert.deepEqual(wireProjection, { 'after.plainText': 1, _id: 0 }, 'summary reads must stay small on the wire');
    const nested = await Model.findById(original._id).select('before.claims.history.event -_id').lean();
    assert.deepEqual(nested, { before: { claims: [{ history: [{ event: 'created' }] }] } });
    const metadata = await Model.findById(original._id).select('summary -_id').lean();
    assert.deepEqual(metadata, { summary: 'metadata changed' });
    assert.deepEqual(await Model.findById(original._id).select('_id').lean(), { _id: original._id });
    const excluded = await Model.findById(original._id).select('-before -after.claims.history -_id').lean();
    assert.deepEqual(excluded, { summary: 'metadata changed', after: { plainText: 'article', claims: [{ claimId: 'one', support: 'supported' }] } });
    assert.equal((await Model.findOne({ 'after.plainText': 'article' }).lean()).after.claims[0].history[0].event, 'updated');
    doc.before = { changed: true };
    await assert.rejects(doc.save(), /immutable/);
    await assert.rejects(Model.updateOne({ _id: original._id }, { $set: { 'after.claims': [] } }), /immutable/);
    const changed = await Model.findOneAndUpdate({ _id: original._id }, { $set: { summary: 'returned safely' } }, { new: true }).lean();
    assert.deepEqual(changed.after, original.after);
    assert.equal(changed[FIELD], undefined);
    const ordinary = { ...original, _id: new mongoose.Types.ObjectId() };
    await Model.collection.insertOne(ordinary);
    for (const projection of [{ before: 1 }, { 'after.claims.support': 1, _id: 0 },
      { before: 0, 'after.claims.history': 0 }, { summary: 1 }, { _id: 1 }]) {
      const expected = await Model.collection.findOne({ _id: ordinary._id }, { projection });
      assert.deepEqual(await Model.findById(ordinary._id).select(projection).lean(), expected);
    }
    await Model.updateOne({ _id: original._id }, { $set: { before: null, after: null } });
    assert.equal((await Model.collection.findOne({ _id: original._id }))[FIELD], undefined);
    console.log('archive Mongo acceptance passed: full/lean/projections/privacy/save/query/prune');
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; mongoose.disconnect(); });
