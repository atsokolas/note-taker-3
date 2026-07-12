const assert = require('assert');
const express = require('express');
const { buildWikiRouter } = require('../wikiRoutes');

class Query {
  constructor(value) {
    this.value = value;
  }

  sort() { return this; }
  limit() { return this; }
  lean() { return Promise.resolve(JSON.parse(JSON.stringify(this.value))); }
}

const page = (overrides = {}) => ({
  _id: overrides._id,
  slug: overrides.slug || overrides._id,
  title: overrides.title,
  pageType: overrides.pageType || 'topic',
  status: 'published',
  visibility: 'shared',
  body: overrides.body || { type: 'doc', content: [] },
  plainText: overrides.title,
  sourceRefs: overrides.sourceRefs || [],
  claims: overrides.claims || [],
  externalWatches: overrides.externalWatches || {},
  aiState: overrides.aiState || {},
  freshness: overrides.freshness || {},
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z'
});

const records = [
  page({ _id: 'alphabet', title: 'Alphabet is Berkshire Hathaway 2.0' }),
  page({ _id: 'margin', title: 'Margin of Safety in Value Investing' }),
  page({ _id: 'circle', title: 'Circle of Competence' }),
  page({ _id: 'map', title: 'AI Infrastructure Market Map', pageType: 'overview' }),
  page({ _id: 'question', title: 'Will inference economics commoditize models?', pageType: 'question' }),
  page({
    _id: 'repo',
    title: 'Atsokolas/Note-Taker-3 Repo Wiki',
    pageType: 'repo',
    sourceRefs: [{ _id: 'private-source-id', sourceRefId: 'private-source-link', title: 'README', url: 'https://github.com/atsokolas/note-taker-3' }],
    claims: [{ claimId: 'claim-1', text: 'Noeis is maintained.' }],
    body: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Noeis is maintained.',
          marks: [
            { type: 'claim', attrs: { claimId: 'private-claim-id', support: 'supported', citationIndexes: [1] } },
            { type: 'wikiLink', attrs: { pageId: 'private-neighbor-id', title: 'Private neighbor' } }
          ]
        }]
      }]
    },
    externalWatches: {
      githubRepo: {
        owner: 'atsokolas',
        repo: 'note-taker-3',
        status: 'active',
        publishedHeadSha: '54154fb6123456789',
        candidateHeadSha: 'newer-candidate'
      }
    }
  })
];

const WikiPage = {
  find: () => new Query(records)
};

const run = async () => {
  const app = express();
  app.use(buildWikiRouter({
    authenticateToken: (_req, _res, next) => next(),
    WikiPage
  }));
  const server = await new Promise(resolve => {
    const next = app.listen(0, '127.0.0.1', () => resolve(next));
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/public/wiki/proof`);
    const payload = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(payload.complete, true);
    assert.strictEqual(payload.expectedCount, 6);
    assert.strictEqual(payload.items.length, 6);
    assert.strictEqual(payload.items[0].slot, 'alphabet');
    assert.strictEqual(payload.homepageCta.href, '/share/wiki/alphabet');
    assert.strictEqual(payload.items[5].maintenanceProof.currentThrough.label, 'Commit 54154fb');
    assert.strictEqual(payload.items[0].proofGrade.grade, 'acceptance_in_progress');
    assert.strictEqual(payload.items[1].proofGrade.grade, 'illustrative');
    assert.strictEqual(payload.items[5].proofGrade.grade, 'candidate');
    assert.strictEqual(payload.items[5].proofGrade.comparisonUrl, '/share/wiki/repo/comparison');
    assert.strictEqual(payload.items.some(item => item.proofGrade.grade === 'proven'), false);
    assert.ok(!JSON.stringify(payload).includes('newer-candidate'));
    assert.ok(!JSON.stringify(payload).includes('externalWatches'));
    assert.ok(!JSON.stringify(payload).includes('private-source-id'));
    assert.ok(!JSON.stringify(payload).includes('private-source-link'));
    assert.ok(!JSON.stringify(payload).includes('private-claim-id'));
    assert.ok(!JSON.stringify(payload).includes('private-neighbor-id'));
    assert.ok(!payload.items[5].page.body);
    assert.deepStrictEqual(payload.items[5].page.sourceRefs, [{
      title: 'README',
      url: 'https://github.com/atsokolas/note-taker-3'
    }]);
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => console.log('wikiRoutes public proof tests passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
