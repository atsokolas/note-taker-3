const assert = require('assert');
const {
  buildWikiRevisionRetentionPlan,
  collectPageRetentionReferences,
  pruneWikiRevisionHistory
} = require('./wikiRevisionRetentionService');

const revisions = Array.from({ length: 60 }, (_, index) => ({
  _id: `revision-${index}`,
  createdAt: new Date(Date.UTC(2026, 6 - Math.floor(index / 10), 20 - (index % 10))),
  promotionStatus: index === 25 ? 'candidate' : index === 35 ? 'rejected' : 'promoted',
  sourceEventId: index === 45 ? 'accepted-event' : null,
  sourceVersion: index === 50 ? { headSha: 'published-sha' } : null
}));

const plan = buildWikiRevisionRetentionPlan({
  revisions,
  protectedRevisionIds: ['revision-40'],
  acceptedSourceEventIds: ['accepted-event'],
  publishedHeadSha: 'published-sha',
  recentLimit: 20
});

for (let index = 0; index < 20; index += 1) assert(plan.keptIds.includes(`revision-${index}`));
assert(plan.keptIds.includes('revision-59'), 'keeps original revision');
assert(plan.keptIds.includes('revision-25'), 'keeps newest candidate');
assert(plan.keptIds.includes('revision-35'), 'keeps newest rejection');
assert(plan.keptIds.includes('revision-40'), 'keeps explicit reference');
assert(plan.keptIds.includes('revision-45'), 'keeps accepted source event');
assert(plan.keptIds.includes('revision-50'), 'keeps published head');
assert(plan.deletedIds.length > 0, 'identifies redundant snapshots');

const references = collectPageRetentionReferences({
  publicProof: { acceptedClocks: [{ revisionId: 'clock-revision', sourceEventId: 'clock-event' }] },
  freshness: { acceptedThrough: { revisionId: 'fresh-revision', sourceEventId: 'fresh-event' } },
  externalWatches: { githubRepo: { publishedHeadSha: 'head' } }
});
assert.deepStrictEqual(references.revisionIds.sort(), ['clock-revision', 'fresh-revision']);
assert.deepStrictEqual(references.sourceEventIds.sort(), ['clock-event', 'fresh-event']);
assert.strictEqual(references.publishedHeadSha, 'head');

console.log('wikiRevisionRetentionService tests passed');

(async () => {
  const updated = [];
  const rows = Array.from({ length: 25 }, (_, index) => ({
    _id: `byte-revision-${index}`,
    createdAt: new Date(Date.UTC(2026, 6, 25 - index)),
    promotionStatus: 'promoted'
  }));
  const WikiRevision = {
    countDocuments: async () => rows.length,
    aggregate: async () => [{ bytes: 16 * 1024 * 1024 }],
    find: () => ({
      select() { return this; },
      sort() { return this; },
      lean: async () => rows
    }),
    updateMany: async (query, update) => {
      updated.push({ query, update });
      return { matchedCount: query._id.$in.length };
    },
    db: { models: {} }
  };
  const result = await pruneWikiRevisionHistory({
    WikiRevision,
    userId: 'user-1',
    pageId: 'page-1',
    page: {},
    recentLimit: 20
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.deletedIds.length, 3);
  assert.strictEqual(result.compactableSnapshotIds.length, 3);
  assert.strictEqual(updated.length, 1);
  assert.deepStrictEqual(updated[0].update.$set.before, null);
  assert.deepStrictEqual(updated[0].update.$set.after, null);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
