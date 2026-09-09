const assert = require('assert');
const {
  createWikiRevision,
  matchesTrustedRevisionHead,
  resolveRevisionSnapshot,
  snapshotCanonicalContentHash
} = require('./wikiRevisionService');

/* Two thirds of the cluster was wiki revisions, and most of them recorded that
   nothing had happened by storing the whole page twice to say so. The repo page
   alone put on 74MB in three days with its five latest revisions byte-identical.
   A pass that changed nothing now keeps no payload and says which it is. */
const pageAt = (text) => ({
  _id: 'page-1',
  title: 'Repo wiki',
  slug: 'repo-wiki',
  pageType: 'topic',
  status: 'published',
  visibility: 'private',
  sourceScope: 'entire_library',
  body: { text },
  plainText: text,
  sourceRefs: [],
  claims: [],
  citations: []
});

const captureModel = () => {
  const saved = [];
  function WikiRevision(doc) { Object.assign(this, doc); saved.push(this); }
  WikiRevision.prototype.save = async function save() { return this; };
  WikiRevision.countDocuments = undefined;
  return { WikiRevision, saved };
};

const create = async ({ before, after, page }) => {
  const { WikiRevision, saved } = captureModel();
  await createWikiRevision({
    WikiRevision,
    userId: 'user-1',
    pageId: 'page-1',
    page,
    before,
    after,
    reason: 'source_event',
    actorType: 'agent',
    sourceEventId: 'event-1',
    maintenanceRunId: 'run-1',
    summary: 'Maintained from a source event.',
    pruneRevisionHistory: async () => null
  });
  return saved[0];
};

(async () => {
  const unchangedText = 'Founder mode is a claim about proximity.';

  // A pass that changed nothing keeps its row, its links and its summary, and
  // not one byte of the page it did not change.
  {
    const before = pageAt(unchangedText);
    const revision = await create({ before, after: pageAt(unchangedText) });
    assert.strictEqual(revision.before, null);
    assert.strictEqual(revision.after, null);
    assert.strictEqual(revision.snapshotUnchanged, true);
    assert.strictEqual(revision.contentHash, snapshotCanonicalContentHash(pageAt(unchangedText)));
    // Everything downstream acceptance depends on is still here.
    assert.strictEqual(String(revision.sourceEventId), 'event-1');
    assert.strictEqual(String(revision.maintenanceRunId), 'run-1');
    assert.strictEqual(revision.summary, 'Maintained from a source event.');
    assert.strictEqual(revision.reason, 'source_event');
    // Not snapshotPrunedAt: retention lost a payload, this one was never worth
    // writing. decisionIndexService treats those two very differently.
    assert.strictEqual(revision.snapshotPrunedAt, undefined);
  }

  /* Only the pass's notes about itself may differ. A page that became published,
     was renamed, changed hands or gained a public proof changed something an
     auditor cares about, and keeps both sides even with the prose untouched. */
  {
    const before = { ...pageAt(unchangedText), freshness: { lastMaintainedAt: '2026-09-05' }, aiState: { maintenanceSummary: 'a' } };
    const after = { ...pageAt(unchangedText), freshness: { lastMaintainedAt: '2026-09-08' }, aiState: { maintenanceSummary: 'b' } };
    const revision = await create({ before, after });
    assert.strictEqual(revision.snapshotUnchanged, true, 'bookkeeping churn must not count as a change');
  }

  for (const [field, value] of [
    ['status', 'archived'],
    ['visibility', 'public'],
    ['slug', 'renamed'],
    ['pageType', 'repo'],
    ['sourceScope', 'selected_sources'],
    ['adoptedFrom', { userId: 'someone-else' }],
    ['publicProof', { grade: 'proven' }]
  ]) {
    const before = pageAt(unchangedText);
    const after = { ...pageAt(unchangedText), [field]: value };
    const revision = await create({ before, after });
    assert.ok(revision.after, `a change of ${field} must keep its payload`);
    assert.ok(!revision.snapshotUnchanged, `a change of ${field} is not bookkeeping`);
  }

  // A pass that changed something stores both sides, as before.
  {
    const revision = await create({
      before: pageAt(unchangedText),
      after: pageAt('Proximity is the claim, and it does not scale.')
    });
    assert.ok(revision.before, 'a real change keeps its before');
    assert.ok(revision.after, 'a real change keeps its after');
    assert.ok(!revision.snapshotUnchanged);
  }

  // The first revision of a page has no before and must keep its after.
  {
    const revision = await create({ before: null, page: pageAt(unchangedText) });
    assert.ok(revision.after, 'a first revision keeps the page it created');
    assert.ok(!revision.snapshotUnchanged);
  }

  // What an unchanged revision stands for is read back off the chain, exactly.
  {
    const content = pageAt(unchangedText);
    const older = { _id: 'r1', pageId: 'page-1', createdAt: '2026-09-05T00:00:00Z', after: content };
    const unchanged = {
      _id: 'r2',
      pageId: 'page-1',
      createdAt: '2026-09-06T00:00:00Z',
      after: null,
      snapshotUnchanged: true,
      contentHash: snapshotCanonicalContentHash(content)
    };
    assert.deepStrictEqual(resolveRevisionSnapshot(unchanged, [older, unchanged]), content);
    // Through more than one link of the chain.
    const alsoUnchanged = {
      _id: 'r3',
      pageId: 'page-1',
      createdAt: '2026-09-07T00:00:00Z',
      after: null,
      snapshotUnchanged: true,
      contentHash: snapshotCanonicalContentHash(content)
    };
    assert.deepStrictEqual(
      resolveRevisionSnapshot(alsoUnchanged, [older, unchanged, alsoUnchanged]),
      content
    );
  }

  // A payload retention removed is content that is gone. Guessing would be
  // worse than saying so, so it says so.
  {
    const pruned = {
      _id: 'r9',
      pageId: 'page-1',
      createdAt: '2026-09-06T00:00:00Z',
      after: null,
      snapshotPrunedAt: new Date()
    };
    assert.strictEqual(resolveRevisionSnapshot(pruned, [pruned]), null);
  }

  // A chain whose earlier content does not match the recorded hash is a chain
  // something else has been at. Report nothing rather than the wrong thing.
  {
    const unchanged = {
      _id: 'r2',
      pageId: 'page-1',
      createdAt: '2026-09-06T00:00:00Z',
      after: null,
      snapshotUnchanged: true,
      contentHash: snapshotCanonicalContentHash(pageAt('what it actually stood for'))
    };
    const wrong = { _id: 'r1', pageId: 'page-1', createdAt: '2026-09-05T00:00:00Z', after: pageAt('something else') };
    assert.strictEqual(resolveRevisionSnapshot(unchanged, [wrong, unchanged]), null);
  }

  // Another page's revisions are not this page's history.
  {
    const unchanged = {
      _id: 'r2',
      pageId: 'page-1',
      createdAt: '2026-09-06T00:00:00Z',
      after: null,
      snapshotUnchanged: true,
      contentHash: snapshotCanonicalContentHash(pageAt(unchangedText))
    };
    const otherPage = { _id: 'x1', pageId: 'page-2', createdAt: '2026-09-05T00:00:00Z', after: pageAt(unchangedText) };
    assert.strictEqual(resolveRevisionSnapshot(unchanged, [otherPage, unchanged]), null);
  }

  // A trusted head recorded under the canonical hash is still verifiable with
  // no payload to check it against.
  {
    const content = pageAt(unchangedText);
    const hash = snapshotCanonicalContentHash(content);
    const revision = {
      before: null,
      snapshotUnchanged: true,
      contentHash: hash,
      sourceVersion: { trustedHeadHash: hash }
    };
    assert.strictEqual(matchesTrustedRevisionHead({ current: content, revision }), true);
    assert.strictEqual(
      matchesTrustedRevisionHead({ current: pageAt('moved on'), revision }),
      false
    );
  }

  console.log('wikiRevisionService unchanged-snapshot tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
