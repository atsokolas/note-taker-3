const assert = require('node:assert/strict');
const { ObjectId, EJSON } = require('bson');
const mongoose = require('mongoose');
const {
  FIELD,
  packRevisionHistories,
  packWhenWorthwhile,
  revisionHistoryArchivePlugin,
  unpackRevisionHistories
} = require('./wikiRevisionHistoryArchive');

const revision = {
  _id: new ObjectId(), userId: new ObjectId(), pageId: new ObjectId(),
  createdAt: new Date('2026-08-01'), promotionStatus: 'promoted',
  before: { claims: [{ claimId: 'one', history: Array.from({ length: 100 }, (_, i) => ({
    at: new Date('2026-08-01'), event: 'updated', confidence: 0.72,
    sourceRefIds: [new ObjectId('6a4aa6d7f49a75d10668c08e')], text: 'Repeated evidence'.repeat(50), sequence: i
  })) }, { claimId: 'two' }] },
  after: { plainText: 'Keep queryable', claims: [{ claimId: 'one', history: [] }] }
};
const packed = packRevisionHistories(revision);
assert.deepEqual(unpackRevisionHistories(packed), revision);
assert.equal(packed.after.plainText, revision.after.plainText);
assert.equal(packed.before.claims[0].history, null);
assert.equal(JSON.stringify(unpackRevisionHistories(packed)), JSON.stringify(revision));
assert(revision.before.claims[0].history.length === 100, 'packing must not mutate input');
assert(Buffer.byteLength(EJSON.stringify(packed)) < Buffer.byteLength(EJSON.stringify(revision)) / 4);
const worthwhile = packWhenWorthwhile(revision, 1000);
assert.equal(worthwhile.archived, true);
assert(worthwhile.savedBytes > 1000);
assert.deepEqual(unpackRevisionHistories(worthwhile.revision), revision);
assert.equal(packWhenWorthwhile({ before: null, after: null }, 1000).archived, false);
assert.throws(() => packRevisionHistories(packed), /already archived/);
assert.throws(() => unpackRevisionHistories({ ...packed, [FIELD]: { ...packed[FIELD], sha256: 'bad' } }), /integrity/);
assert.throws(() => unpackRevisionHistories({ ...packed, [FIELD]: { ...packed[FIELD], version: 2 } }), /Invalid/);
assert.throws(() => unpackRevisionHistories({ ...packed, before: { claims: [...packed.before.claims].reverse() } }), /identity/);
assert.throws(() => unpackRevisionHistories({ ...packed, before: { claims: [] } }), /binding/);
for (const value of [{ before: null, after: null }, { before: { claims: [{ claimId: 'null', history: null }] } }]) {
  assert.deepEqual(unpackRevisionHistories(packRevisionHistories(value)), value);
}
(async () => {
  const schema = new mongoose.Schema({ before: Object, after: Object });
  schema.plugin(revisionHistoryArchivePlugin);
  const Model = mongoose.model(`ArchiveWriteAcceptance${Date.now()}`, schema);
  let inserted;
  Model.collection.insertOne = async document => {
    inserted = document;
    return { acknowledged: true, insertedId: document._id };
  };
  const largeBefore = {
    claims: [{ claimId: 'one', history: Array.from({ length: 200 }, (_, index) => ({
      index,
      text: 'Compressible accepted claim history '.repeat(100)
    })) }]
  };
  const document = new Model({ before: largeBefore, after: revision.after });
  await document.save();
  assert(inserted[FIELD], 'large histories must be compressed before the database write');
  assert.equal(inserted.before.claims[0].history, null);
  assert.deepEqual(document.before, largeBefore, 'callers keep the ordinary revision contract');
  assert.equal(document[FIELD], undefined);
  assert.equal(document.$locals.archivedRevisionHistories, true);
  console.log('wikiRevisionHistoryArchive: lossless round trip, integrity, bindings, compression, and bounded writes passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
