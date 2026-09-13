const assert = require('assert');
const {
  RECEIPT_RETENTION_KINDS,
  buildWikiRevisionRetentionPlan,
  collectPageRetentionReferences,
  collectReceiptRetentionReferences,
  pruneWikiRevisionHistory
} = require('./wikiRevisionRetentionService');
const { resolveRevisionSnapshot, snapshotCanonicalContentHash } = require('./wikiRevisionService');

const revisions = Array.from({ length: 60 }, (_, index) => ({
  _id: `revision-${index}`,
  createdAt: new Date(Date.UTC(2026, 6 - Math.floor(index / 10), 20 - (index % 10))),
  promotionStatus: index === 25 ? 'candidate' : index === 35 ? 'rejected' : 'promoted',
  sourceEventId: index === 45 ? 'accepted-event' : null,
  sourceVersion: index === 50 ? { headSha: 'published-sha' } : null
}));
revisions[44].claimReview = {
  version: 1,
  state: 'accepted',
  events: [{ action: 'accept', actorType: 'human' }]
};
for (const index of [42, 43]) {
  revisions[index].promotionStatus = 'candidate';
  revisions[index].claimReview = { version: 1, scope: 'claim', state: 'pending', events: [] };
}

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
assert(plan.keptIds.includes('revision-44'), 'keeps every human-reviewed claim revision');
assert(plan.keepReasons['revision-44'].includes('human_claim_review'), 'records the human-review retention reason');
for (const index of [42, 43]) {
  assert(plan.keepReasons[`revision-${index}`].includes('active_claim_review'), 'keeps every pending cohort member, not only the newest candidate');
}
assert(plan.keptIds.includes('revision-45'), 'keeps accepted source event');
assert(plan.keptIds.includes('revision-50'), 'keeps published head');
assert(plan.deletedIds.length > 0, 'identifies redundant snapshots');

const pressurePlan = buildWikiRevisionRetentionPlan({
  revisions,
  protectedRevisionIds: ['revision-40'],
  acceptedSourceEventIds: ['accepted-event'],
  publishedHeadSha: 'published-sha',
  recentLimit: 5
});
for (let index = 0; index < 5; index += 1) assert(pressurePlan.keptIds.includes(`revision-${index}`));
assert(pressurePlan.keptIds.includes('revision-59'), 'pressure mode keeps the original');
assert(pressurePlan.keptIds.includes('revision-25'), 'pressure mode keeps the newest candidate');
assert(pressurePlan.keptIds.includes('revision-35'), 'pressure mode keeps the newest rejection');
assert(pressurePlan.keptIds.includes('revision-40'), 'pressure mode keeps explicit references');
assert(pressurePlan.keptIds.includes('revision-44'), 'pressure mode keeps human-reviewed revisions');
assert(pressurePlan.keptIds.includes('revision-45'), 'pressure mode keeps accepted source events');
assert(pressurePlan.keptIds.includes('revision-50'), 'pressure mode keeps the published repo head');
assert(pressurePlan.deletedIds.length > plan.deletedIds.length, 'pressure mode compacts more unprotected snapshots');

// Retention must preserve the content a protected metadata-only version reads.
const earlierContent = { title: 'Earlier reasoning', body: { text: 'A premise worth keeping.' }, claims: [] };
const historyRow = (id, day, fields = {}) => ({
  _id: id, pageId: 'page-1', createdAt: new Date(Date.UTC(2026, 0, day)),
  promotionStatus: 'promoted', ...fields
});
const unchanged = { snapshotUnchanged: true, contentHash: snapshotCanonicalContentHash(earlierContent) };
const history = [
  historyRow('original', 1, { after: { title: 'Original' } }),
  historyRow('referenced-base', 2, { after: earlierContent }),
  historyRow('referenced-unchanged', 3, unchanged),
  historyRow('disposable-full', 4, { after: { title: 'Superseded automatic version' } }),
  historyRow('second-full', 5, { after: { title: 'Second' } }),
  historyRow('latest-full', 6, { after: { title: 'Latest' } }),
  historyRow('latest-unchanged', 7, { snapshotUnchanged: true }),
  historyRow('latest-pruned', 8, { snapshotPrunedAt: new Date() })
];
const dependencyPlan = buildWikiRevisionRetentionPlan({
  revisions: history, recentLimit: 2, protectedRevisionIds: ['referenced-unchanged']
});
assert(dependencyPlan.keepReasons['second-full'].includes('recent_payload'), 'empty rows do not consume the full-version allowance');
assert(dependencyPlan.keepReasons['referenced-base'].includes('unchanged_snapshot_base'), 'protects the old referenced version beyond the recent allowance');
assert(dependencyPlan.deletedIds.includes('disposable-full'), 'the preservation check exercises an actual payload prune');
const retainedHistory = history.map(row => dependencyPlan.deletedIds.includes(row._id)
  ? { ...row, before: null, after: null, snapshotPrunedAt: new Date() } : row);
assert.deepStrictEqual(
  resolveRevisionSnapshot(history.find(row => row._id === 'referenced-unchanged'), retainedHistory),
  earlierContent,
  'a referenced unchanged version still resolves exactly after pruning'
);

const references = collectPageRetentionReferences({
  aiState: { firstHeadCandidateRevisionId: 'first-head-candidate', maintenanceCandidateRevisionId: 'maintenance-candidate' },
  publicProof: { acceptedClocks: [{ revisionId: 'clock-revision', sourceEventId: 'clock-event' }] },
  freshness: { acceptedThrough: { revisionId: 'fresh-revision', sourceEventId: 'fresh-event' } },
  judgment: {
    initialRevisionId: 'initial-judgment-revision',
    decisions: [{
      acceptedRevisionId: 'decision-basis-revision',
      recordedRevisionId: 'decision-recorded-revision',
      outcome: { revisionId: 'decision-outcome-revision' }
    }]
  },
  externalWatches: { githubRepo: { publishedHeadSha: 'head' } }
});
assert.deepStrictEqual(references.revisionIds.sort(), [
  'clock-revision',
  'decision-basis-revision',
  'decision-outcome-revision',
  'decision-recorded-revision',
  'first-head-candidate',
  'fresh-revision',
  'initial-judgment-revision',
  'maintenance-candidate'
]);
assert.deepStrictEqual(references.sourceEventIds.sort(), ['clock-event', 'fresh-event']);
assert.strictEqual(references.publishedHeadSha, 'head');

const receiptReferences = collectReceiptRetentionReferences([
  {
    status: 'completed',
    provenance: {
      revisionId: 'public-acceptance-revision',
      revisionIds: ['cohort-revision'],
      sourceEventId: 'cohort-event',
      acceptedClocks: [{ revisionId: 'clock-revision', sourceEventId: 'clock-event' }]
    }
  },
  { status: 'failed', provenance: { revisionId: 'failed-revision' } }
]);
assert.deepStrictEqual(receiptReferences.revisionIds.sort(), [
  'clock-revision',
  'cohort-revision',
  'public-acceptance-revision'
]);
assert.deepStrictEqual(receiptReferences.sourceEventIds.sort(), ['clock-event', 'cohort-event']);
assert(
  RECEIPT_RETENTION_KINDS.includes('authored_source_correction'),
  'retains source events named by an authored source-correction receipt'
);

console.log('wikiRevisionRetentionService tests passed');

(async () => {
  const updated = [];
  const rows = Array.from({ length: 25 }, (_, index) => ({
    _id: `byte-revision-${index}`,
    createdAt: new Date(Date.UTC(2026, 6, 25 - index)),
    promotionStatus: 'promoted'
  }));
  rows.push({ _id: 'old-metadata-only', createdAt: new Date(Date.UTC(2026, 6, 3, 12)), snapshotUnchanged: true });
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
    db: {
      models: {
        NoeisReceipt: {
          find: query => {
            assert.strictEqual(query['provenance.pageId'], 'page-1');
            return {
              select() { return this; },
              lean: async () => [{
                status: 'completed',
                kind: 'public_proof_accepted',
                provenance: { pageId: 'page-1', revisionId: 'byte-revision-21' }
              }]
            };
          }
        }
      }
    }
  };
  await assert.rejects(pruneWikiRevisionHistory({
    WikiRevision,
    userId: 'user-1',
    pageId: 'page-1',
    page: {},
    recentLimit: 20
  }), /Verified backup required/);
  assert.strictEqual(updated.length, 0, 'snapshot compaction fails before mutation without a backup');

  const result = await pruneWikiRevisionHistory({
    WikiRevision,
    userId: 'user-1',
    pageId: 'page-1',
    page: {},
    recentLimit: 20,
    beforeCompactSnapshots: async ({ revisionIds }) => ({
      verified: true,
      filename: '/tmp/wiki-revisions-test.jsonl.gz',
      documentCount: revisionIds.length,
      sha256: 'test-sha256',
      idFingerprint: 'test-fingerprint'
    })
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.deletedIds.length, 3);
  assert.strictEqual(result.compactableSnapshotIds.length, 2);
  assert(!result.compactableSnapshotIds.includes('old-metadata-only'), 'does not back up and prune a row with no payload');
  assert.strictEqual(result.compactableSnapshotBytes, 16 * 1024 * 1024);
  assert(result.keptIds.includes('byte-revision-21'));
  assert.strictEqual(updated.length, 1);
  assert.deepStrictEqual(updated[0].update.$set.before, null);
  assert.deepStrictEqual(updated[0].update.$set.after, null);
  assert.strictEqual(result.backup.verified, true);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
