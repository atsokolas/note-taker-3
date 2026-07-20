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
  publicProof: overrides.publicProof || null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z'
});

const records = [
  page({ _id: 'alphabet', title: 'Alphabet is Berkshire Hathaway 2.0' }),
  page({
    _id: 'nvidia',
    title: 'NVIDIA’s AI engine—and the obligations underneath it',
    sourceRefs: [{ title: 'NVIDIA 8-K', url: 'https://www.sec.gov/Archives/nvidia' }],
    claims: [{ claimId: 'nvidia-claim', text: 'NVIDIA issued senior notes.' }],
    externalWatches: { edgar: { status: 'active', ticker: 'NVDA', cik: '0001045810' } },
    freshness: { acceptedThrough: { sourceEventId: 'nvidia-event', title: 'NVIDIA 8-K filed 2026-06-18', url: 'https://www.sec.gov/Archives/nvidia', acceptedAt: '2026-07-19T00:00:00.000Z' } },
    aiState: { changeLog: [{ type: 'maintenance', text: 'Updated the balance-sheet claim.', createdAt: '2026-07-19T00:00:00.000Z' }] },
    publicProof: {
      grade: 'proven', acceptedAt: '2026-07-19T00:00:00.000Z', acceptedEventId: 'accepted-nvidia',
      reason: 'A source-backed NVIDIA SEC maintenance event passed acceptance.',
      acceptedClocks: [{ type: 'sec_edgar', sourceEventId: 'nvidia-event', revisionId: 'nvidia-revision', acceptedAt: '2026-07-19T00:00:00.000Z' }]
    }
  }),
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
        defaultBranch: 'main',
        status: 'active',
        lastHeadSha: '54154fb6123456789',
        publishedHeadSha: '54154fb6123456789',
        candidateHeadSha: 'newer-candidate',
        buildStatus: 'building',
        lastPublishedAt: '2026-07-11T00:00:00.000Z'
      }
    }
  }),
  page({
    _id: 'openai-agents',
    title: 'openai/openai-agents-js maintained developer dossier',
    pageType: 'repo',
    sourceRefs: [{ title: 'AI SDK adapter', url: 'https://github.com/openai/openai-agents-js' }],
    claims: [{ claimId: 'claim-openai', text: 'Provider tool search changed.' }],
    externalWatches: {
      githubRepo: {
        owner: 'openai', repo: 'openai-agents-js', defaultBranch: 'main', status: 'active',
        lastHeadSha: '710cccfd8fd26b395f8e3470419852d76de80967',
        publishedHeadSha: '710cccfd8fd26b395f8e3470419852d76de80967',
        candidateHeadSha: '', buildStatus: 'ready', lastPublishedAt: '2026-07-19T00:00:00.000Z'
      }
    },
    aiState: {
      changeLog: [{ type: 'maintenance', text: 'Rewrote the provider tool-search contract.', createdAt: '2026-07-19T00:00:00.000Z' }]
    },
    publicProof: {
      grade: 'proven', acceptedAt: '2026-07-19T00:00:00.000Z', acceptedEventId: 'accepted-openai',
      reason: 'A source-backed external repository maintenance event passed acceptance.',
      acceptedClocks: [{ type: 'github', sourceEventId: 'event-openai', revisionId: 'revision-openai', acceptedAt: '2026-07-19T00:00:00.000Z' }]
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
    assert.strictEqual(payload.expectedCount, 8);
    assert.strictEqual(payload.items.length, 8);
    assert.strictEqual(payload.items[0].slot, 'alphabet');
    assert.strictEqual(payload.homepageCta.href, '/share/wiki/alphabet');
    assert.strictEqual(payload.items[6].maintenanceProof.currentThrough.label, 'Commit 54154fb');
    assert.strictEqual(payload.items[0].proofGrade.grade, 'acceptance_in_progress');
    assert.deepStrictEqual(payload.items[0].proofGrade.criteria.requiredClocks, {
      secEdgar: false
    });
    assert.deepStrictEqual(payload.items[0].proofGrade.criteria.optionalClocks, {
      earningsTranscript: false
    });
    assert.strictEqual(payload.items[1].slot, 'nvidia');
    assert.strictEqual(payload.items[1].proofGrade.grade, 'proven');
    assert.deepStrictEqual(payload.items[1].proofGrade.criteria.requiredClocks, { secEdgar: true });
    assert.strictEqual(payload.items[2].proofGrade.grade, 'illustrative');
    assert.strictEqual(payload.items[6].proofGrade.grade, 'candidate');
    assert.strictEqual(payload.items[6].title, 'atsokolas/note-taker-3 Repo Wiki');
    assert.strictEqual(payload.items[6].proofGrade.comparisonUrl, '/share/wiki/repo/comparison');
    assert.strictEqual(payload.items[6].page.githubRepo, undefined);
    assert.strictEqual(payload.items[7].slot, 'openai-agents-js');
    assert.strictEqual(payload.items[7].proofGrade.grade, 'proven');
    assert.strictEqual(payload.items[7].proofGrade.comparisonUrl, '/share/wiki/openai-agents/comparison');
    assert.deepStrictEqual(payload.items[7].proofGrade.criteria.requiredClocks, { github: true });
    assert.ok(!JSON.stringify(payload).includes('newer-candidate'));
    assert.ok(!JSON.stringify(payload).includes('externalWatches'));
    assert.ok(!JSON.stringify(payload).includes('private-source-id'));
    assert.ok(!JSON.stringify(payload).includes('private-source-link'));
    assert.ok(!JSON.stringify(payload).includes('private-claim-id'));
    assert.ok(!JSON.stringify(payload).includes('private-neighbor-id'));
    assert.ok(!payload.items[6].page.body);
    assert.deepStrictEqual(payload.items[6].page.sourceRefs, [{
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
