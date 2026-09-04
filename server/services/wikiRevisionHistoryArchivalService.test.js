const assert = require('node:assert/strict');
const { ObjectId, deserialize, serialize } = require('bson');
const { FIELD, unpackRevisionHistories } = require('./wikiRevisionHistoryArchive');
const { archiveEligibleRevisionHistories } = require('./wikiRevisionHistoryArchivalService');

const clone = value => deserialize(serialize(value));
const setPath = (target, path, value) => {
  const parts = path.split('.');
  const key = parts.pop();
  const parent = parts.reduce((node, part) => node[part], target);
  parent[key] = value;
};

const userId = new ObjectId();
const pageId = new ObjectId();
const makeRow = ({ createdAt, suffix }) => ({
  _id: new ObjectId(),
  userId,
  pageId,
  promotionStatus: 'promoted',
  snapshotPrunedAt: null,
  createdAt,
  updatedAt: createdAt,
  before: { claims: [{ claimId: `claim-${suffix}`, history: Array.from({ length: 50 }, (_, index) => ({
    index,
    text: `Repeated history ${suffix} `.repeat(100)
  })) }] },
  after: { claims: [{ claimId: `claim-${suffix}`, history: [] }] }
});

(async () => {
  const older = makeRow({ createdAt: new Date('2026-08-01'), suffix: 'older' });
  const newest = makeRow({ createdAt: new Date('2026-08-03'), suffix: 'newest' });
  const originals = new Map([[String(older._id), clone(older)], [String(newest._id), clone(newest)]]);
  const rows = new Map([...originals].map(([key, value]) => [key, clone(value)]));
  const collection = {
    aggregate: () => ({ toArray: async () => [older, newest].map(row => ({
      _id: row._id, userId: row.userId, pageId: row.pageId, bytes: serialize(row).length
    })) }),
    find: () => ({
      project() { return this; },
      sort() { return this; },
      limit() { return this; },
      toArray: async () => [{ _id: newest._id }]
    }),
    findOne: async query => clone(rows.get(String(query._id))),
    updateOne: async (query, update) => {
      const row = rows.get(String(query._id));
      if (!row || row[FIELD]) return { modifiedCount: 0 };
      Object.entries(update.$set).forEach(([path, value]) => setPath(row, path, clone(value)));
      return { modifiedCount: 1 };
    }
  };
  const result = await archiveEligibleRevisionHistories({
    WikiRevision: { collection },
    now: new Date('2026-08-04'),
    recentLimit: 1,
    minimumAgeMs: 0,
    minimumSavingsBytes: 1000,
    limit: 3,
    dryRun: false
  });
  assert.equal(result.selected, 1);
  assert.equal(result.archived, 1);
  assert(result.savedBytes > 1000);
  assert(rows.get(String(older._id))[FIELD]);
  assert.equal(rows.get(String(newest._id))[FIELD], undefined);
  assert.deepEqual(unpackRevisionHistories(rows.get(String(older._id))), originals.get(String(older._id)));
  console.log('wikiRevisionHistoryArchivalService: bounded candidate selection and lossless CAS write passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
