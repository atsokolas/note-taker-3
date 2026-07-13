const assert = require('assert');
const express = require('express');
const { buildWikiRouter } = require('../wikiRoutes');

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return Promise.resolve(JSON.parse(JSON.stringify(this.value))); }
}

const page = {
  _id: 'repo-page',
  userId: 'owner-1',
  slug: 'repo-proof',
  title: 'Repo proof',
  pageType: 'repo',
  status: 'published',
  visibility: 'shared',
  sourceRefs: [{
    _id: 'source-1',
    title: 'README.md',
    url: 'https://github.com/example/repo/blob/head-2/README.md',
    metadata: { path: 'README.md', blobSha: 'blob-2', commitSha: 'head-2', evidenceType: 'document' }
  }],
  claims: [{ claimId: 'claim-1', text: 'The README explains setup.', support: 'supported', sourceRefIds: ['source-1'] }],
  externalWatches: {
    githubRepo: {
      owner: 'example', repo: 'repo', defaultBranch: 'main',
      lastHeadSha: 'head-2', publishedHeadSha: 'head-2', buildStatus: 'ready'
    }
  }
};

const baseline = {
  _id: 'baseline-1',
  userId: 'owner-1',
  pageId: 'repo-page',
  owner: 'example',
  repo: 'repo',
  defaultBranch: 'main',
  headSha: 'head-1',
  publicEligible: true,
  capturedAt: '2026-07-01T00:00:00.000Z',
  sourceRefs: [{
    sourceRefId: 'baseline-source-1',
    title: 'README.md',
    path: 'README.md',
    blobSha: 'blob-1',
    commitSha: 'head-1',
    evidenceType: 'document',
    url: 'https://github.com/example/repo/blob/head-1/README.md'
  }],
  claims: [{ claimId: 'claim-1', text: 'The README explains setup.', support: 'supported', sourceRefIds: ['baseline-source-1'] }]
};

const run = async () => {
  let pageReads = 0;
  const app = express();
  app.use(buildWikiRouter({
    authenticateToken: (_req, _res, next) => next(),
    WikiPage: { findOne: () => { pageReads += 1; return new Query(page); } },
    WikiRepoBaseline: { findOne: () => new Query(baseline) },
    WikiMaintenanceRun: { find: () => new Query([]) }
  }));
  const server = await new Promise(resolve => {
    const next = app.listen(0, '127.0.0.1', () => resolve(next));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/public/wiki/pages/repo-proof/comparison`;
    const first = await fetch(url);
    const second = await fetch(url);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(first.headers.get('x-noeis-comparison-cache'), 'MISS');
    assert.strictEqual(second.headers.get('x-noeis-comparison-cache'), 'HIT');
    assert.strictEqual(second.headers.get('cache-control'), 'public, max-age=15, stale-while-revalidate=45');
    assert.strictEqual(pageReads, 1);
    assert.deepStrictEqual(await second.json(), await first.json());
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => console.log('wikiRoutes public comparison cache tests passed'))
    .catch(error => { console.error(error); process.exit(1); });
}

module.exports = { run };
