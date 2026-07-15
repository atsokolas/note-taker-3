const assert = require('assert');
const { createWikiRevision, restorePageSnapshot, snapshotPage } = require('./wikiRevisionService');

const page = {
  _id: 'page-1',
  title: 'Alphabet dossier',
  publicProof: {
    grade: 'proven',
    acceptedEventId: 'private-acceptance-record',
    acceptedClocks: [{
      type: 'sec_edgar',
      sourceEventId: 'filing-event',
      revisionId: 'filing-revision',
      acceptedAt: '2026-07-13T00:00:00.000Z'
    }]
  }
};

const snapshot = snapshotPage(page);
assert.deepStrictEqual(snapshot.publicProof, page.publicProof);

const target = {
  publicProof: { grade: 'candidate' },
  modified: [],
  markModified(field) { this.modified.push(field); }
};
restorePageSnapshot(target, snapshot);
assert.deepStrictEqual(target.publicProof, page.publicProof);
assert(target.modified.includes('publicProof'));

class FakeRevision {
  constructor(fields) { Object.assign(this, fields); }
  async save() { this.saved = true; }
}

(async () => {
  let pruneArgs = null;
  const revision = await createWikiRevision({
    WikiRevision: FakeRevision,
    userId: 'user-1',
    page,
    pruneRevisionHistory: async (args) => { pruneArgs = args; }
  });
  assert(revision.saved);
  assert.strictEqual(pruneArgs.pageId, 'page-1');
  assert.strictEqual(pruneArgs.page, page);
  console.log('wikiRevisionService tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
