const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { coveredBy, matchesVector } = require('./unlock_revision_archive');
const { archiveUpdate } = require('../server/services/wikiRevisionHistoryArchive');
const index = { name: 'user', key: { userId: 1 } };
const cover = { name: 'user_date', key: { userId: 1, createdAt: -1 } };
assert(coveredBy(index, cover));
for (const constraint of [{ unique: true }, { sparse: true }, { partialFilterExpression: {} },
  { collation: {} }, { expireAfterSeconds: 0 }]) assert(!coveredBy({ ...index, ...constraint }, cover));
assert(!coveredBy(index, { ...cover, key: { createdAt: -1, userId: 1 } }));
assert(!coveredBy(index, { ...cover, sparse: true }));
assert(!coveredBy(index, { ...cover, key: { userId: -1, createdAt: -1 } }));
const job = { status: 'completed', text: 'Exact passage', payload: { userId: 'owner', type: 'article', objectId: 'source' } };
const vectors = new Map([['owner|article|source|', createHash('sha1').update(job.text).digest('hex')]]);
assert(matchesVector(job, vectors)); // Older queue rows need not carry a stored contentHash.
for (const change of [{ status: 'running' }, { status: 'queued' }, { replayRequired: true },
  { lockedAt: new Date() }, { text: 'Changed' }, { payload: { ...job.payload, userId: 'foreign' } }])
  assert(!matchesVector({ ...job, ...change }, vectors));
assert(!matchesVector(job, new Map()));
assert.deepEqual(archiveUpdate({ before: { claims: [{ history: [] }, {}] },
  after: { claims: [{ history: null }] } }, { snapshotHistoryArchive: { version: 1 } }),
{ $set: { snapshotHistoryArchive: { version: 1 }, 'before.claims.0.history': null, 'after.claims.0.history': null } });
console.log('archive unlock eligibility: passed');
