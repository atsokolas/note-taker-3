const assert = require('assert');
const {
  buildRepoComparison,
  buildProofPulse,
  captureRepoBaseline,
  compareRepoRefs,
  serializePublicRepoComparison
} = require('./wikiRepoComparisonService');

const source = (sourceRefId, path, blobSha, headSha = 'head-1') => ({
  _id: sourceRefId,
  title: path,
  url: `https://github.com/openai/agents-js/blob/${headSha}/${path}`,
  metadata: { path, blobSha, commitSha: headSha, evidenceType: 'code' }
});

const page = {
  _id: 'page-1',
  userId: 'user-1',
  title: 'OpenAI Agents JS Repo Wiki',
  sourceRefs: [source('current-a', 'src/index.ts', 'blob-2', 'head-2'), source('current-b', 'README.md', 'blob-b', 'head-2')],
  claims: [
    { claimId: 'claim-1', text: 'The current entrypoint is src/index.ts.', support: 'supported', sourceRefIds: ['current-a'] },
    { claimId: 'claim-2', text: 'The README remains the starting point.', support: 'supported', sourceRefIds: ['current-b'] }
  ],
  externalWatches: {
    githubRepo: {
      owner: 'openai', repo: 'agents-js', defaultBranch: 'main',
      lastHeadSha: 'candidate-head', publishedHeadSha: 'head-2',
      publishedGeneratorVersion: 'v2', lastReleaseTag: 'v0.2.0', buildStatus: 'queued'
    }
  }
};

(() => {
  const refs = compareRepoRefs(
    [source('base-a', 'src/index.ts', 'blob-1'), source('base-old', 'docs/old.md', 'old')].map(row => ({
      sourceRefId: row._id, path: row.metadata.path, blobSha: row.metadata.blobSha, url: row.url
    })),
    [source('current-a', 'src/index.ts', 'blob-2'), source('current-b', 'README.md', 'blob-b')].map(row => ({
      sourceRefId: row._id, path: row.metadata.path, blobSha: row.metadata.blobSha, url: row.url
    }))
  );
  assert.strictEqual(refs.changed.length, 1);
  assert.strictEqual(refs.added.length, 1);
  assert.strictEqual(refs.removed.length, 1);
})();

(() => {
  const baseline = {
    headSha: 'head-1', releaseTag: 'v0.1.0', generatorVersion: 'v1', capturedAt: new Date(),
    sourceRefs: [
      { sourceRefId: 'base-a', path: 'src/index.ts', blobSha: 'blob-1', url: 'https://github.com/openai/agents-js/blob/head-1/src/index.ts' },
      { sourceRefId: 'base-b', path: 'README.md', blobSha: 'blob-b', url: 'https://github.com/openai/agents-js/blob/head-1/README.md' }
    ],
    claims: [
      { claimId: 'claim-1', text: 'The old entrypoint is src/index.ts.', support: 'supported', sourceRefIds: ['base-a'] },
      { claimId: 'claim-2', text: 'The README remains the starting point.', support: 'supported', sourceRefIds: ['base-b'] }
    ]
  };
  const comparison = buildRepoComparison({
    baseline,
    page,
    maintenanceRuns: [{ _id: 'run-1', metadata: { comparisons: [{ outcome: 'rejected', counts: { changed: 1 }, deltas: {} }] } }]
  });
  assert.strictEqual(comparison.current.publishedHeadSha, 'head-2');
  assert.strictEqual(comparison.current.observedHeadSha, 'candidate-head');
  assert.strictEqual(comparison.repositoryChanges.changed.length, 1);
  assert.strictEqual(comparison.claimComparison.counts.changed, 1);
  assert.strictEqual(comparison.claimComparison.counts.preserved, 1);
  assert.strictEqual(comparison.rejectedCandidates.length, 1);
  assert.strictEqual(comparison.staticWikiErrors.length, 1);
  assert.ok(JSON.stringify(comparison).includes('https://github.com/'));
  comparison.rejectedCandidates[0].deltas = { changed: [{ after: { text: 'Rejected private candidate prose' } }] };
  const publicComparison = serializePublicRepoComparison(comparison);
  const publicJson = JSON.stringify(publicComparison);
  assert.ok(!publicJson.includes('Rejected private candidate prose'));
  ['sourceRefId', 'claimId', 'citationIds', 'sourceRefIds', 'evidenceIds', 'contradictionIds', 'runId']
    .forEach(key => assert.ok(!publicJson.includes(`"${key}"`), `public comparison leaked ${key}`));
  assert.strictEqual(publicComparison.claimComparison.deltas.changed[0].before.text, 'The old entrypoint is src/index.ts.');
  assert.strictEqual(publicComparison.repositoryChanges.changed[0].current.path, 'src/index.ts');
  assert.strictEqual(buildProofPulse(comparison).state, 'repository_ahead');
  assert.ok(buildProofPulse(comparison).headline.includes('trusted head-2'));
})();

(() => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    after: { text: `Changed claim ${index}`, section: 'System map', support: 'supported' }
  }));
  const serialized = serializePublicRepoComparison({
    version: 1,
    repository: {},
    baseline: {},
    current: {},
    repositoryChanges: { added: [], changed: [], removed: [] },
    claimComparison: {
      counts: { added: 0, changed: 20, gainedSupport: 0, contradicted: 0, preserved: 0, removed: 0 },
      deltas: { added: [], changed: rows, gainedSupport: [], contradicted: [], preserved: [], removed: [] }
    },
    rejectedCandidates: [],
    staticWikiErrors: [],
    supportingRefs: []
  });
  assert.strictEqual(serialized.claimComparison.deltas.changed.length, 12);
  assert.strictEqual(serialized.claimComparison.detailsTruncated.changed, 8);
  assert.strictEqual(serialized.claimComparison.counts.changed, 20);
})();

(async () => {
  const records = [];
  function Baseline(payload) { Object.assign(this, payload); this._id = `baseline-${records.length + 1}`; }
  Baseline.findOne = async query => records.find(row => row.userId === query.userId && row.pageId === query.pageId) || null;
  Baseline.prototype.save = async function save() { records.push(this); return this; };
  const Revision = { findOne: () => ({ sort: async () => ({ _id: 'revision-1' }) }) };
  const result = await captureRepoBaseline({ WikiRepoBaseline: Baseline, WikiRevision: Revision, page, userId: 'user-1', publicEligible: true });
  const repeat = await captureRepoBaseline({ WikiRepoBaseline: Baseline, WikiRevision: Revision, page, userId: 'user-1', publicEligible: false });
  assert.strictEqual(result.created, true);
  assert.strictEqual(repeat.created, false);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].headSha, 'head-2');
  assert.strictEqual(records[0].publicEligible, true);
  console.log('wikiRepoComparisonService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
