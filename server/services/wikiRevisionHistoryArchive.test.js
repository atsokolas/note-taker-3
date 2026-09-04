const assert = require('node:assert/strict');
const { ObjectId, EJSON } = require('bson');
const { FIELD, packRevisionHistories, unpackRevisionHistories } = require('./wikiRevisionHistoryArchive');

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
assert.throws(() => packRevisionHistories(packed), /already archived/);
assert.throws(() => unpackRevisionHistories({ ...packed, [FIELD]: { ...packed[FIELD], sha256: 'bad' } }), /integrity/);
assert.throws(() => unpackRevisionHistories({ ...packed, [FIELD]: { ...packed[FIELD], version: 2 } }), /Invalid/);
assert.throws(() => unpackRevisionHistories({ ...packed, before: { claims: [...packed.before.claims].reverse() } }), /identity/);
assert.throws(() => unpackRevisionHistories({ ...packed, before: { claims: [] } }), /binding/);
for (const value of [{ before: null, after: null }, { before: { claims: [{ claimId: 'null', history: null }] } }]) {
  assert.deepEqual(unpackRevisionHistories(packRevisionHistories(value)), value);
}
console.log('wikiRevisionHistoryArchive: lossless round trip, integrity, bindings and compression passed');
