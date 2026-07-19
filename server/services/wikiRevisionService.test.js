const assert = require('assert');
const { createWikiRevision, restorePageSnapshot, snapshotPage } = require('./wikiRevisionService');

const page = {
  _id: 'page-1',
  title: 'QA living thesis',
  judgment: {
    kind: 'thesis',
    governingQuestion: 'What would change this QA judgment?',
    currentJudgment: 'QA-only provisional judgment.',
    initialRevisionId: 'initial-revision',
    causalModel: { summary: 'QA causal narrative.', nodes: [], edges: [] },
    assumptions: [{ assumptionId: 'assumption-1', text: 'QA assumption' }],
    unknowns: [{ unknownId: 'unknown-1', question: 'QA unknown?' }],
    falsifiers: [{ falsifierId: 'falsifier-1', text: 'QA falsifier' }],
    decisions: [{ decisionId: 'decision-1', summary: 'QA research step', status: 'planned' }]
  },
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
assert.deepStrictEqual(snapshot.judgment, page.judgment);

const target = {
  judgment: { kind: 'thesis', initialRevisionId: 'initial-revision', currentJudgment: 'Changed' },
  publicProof: { grade: 'candidate' },
  modified: [],
  markModified(field) { this.modified.push(field); }
};
restorePageSnapshot(target, snapshot);
assert.deepStrictEqual(target.publicProof, page.publicProof);
assert(target.modified.includes('publicProof'));
assert.deepStrictEqual(target.judgment, page.judgment);
assert(target.modified.includes('judgment'));

class FakeRevision {
  constructor(fields) { Object.assign(this, fields); }
  async save(options) { this.saved = true; this.saveOptions = options; }
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
  const session = { id: 'session-1' };
  let transactionalPruneCalled = false;
  const transactionalRevision = await createWikiRevision({
    WikiRevision: FakeRevision,
    userId: 'user-1',
    page,
    session,
    pruneRevisionHistory: async () => { transactionalPruneCalled = true; }
  });
  assert.strictEqual(transactionalRevision.saveOptions.session, session);
  assert.strictEqual(transactionalPruneCalled, false);
  console.log('wikiRevisionService tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
