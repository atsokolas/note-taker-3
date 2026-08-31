const assert = require('assert');
const express = require('express');
const { buildWikiRouter, serializePublicWikiPage } = require('../wikiRoutes');
const { serializePublicCasebook, signCasebook, verifyCasebook } = require('../../services/judgmentPublicProjection');

const PASSAGE = 'LIBRARY_HIGHLIGHT_PASSAGE from the owner corpus.';
const SECRET = 'casebook-route-secret';
process.env.JWT_SECRET = SECRET;

const PAGE_ID = '6a5d1c842da7aa36147472ff';

const stuffed = {
  _id: PAGE_ID,
  userId: 'owner-secret-uid-99',
  slug: 'compute-stays-scarce',
  title: 'Compute stays scarce',
  pageType: 'topic',
  status: 'published',
  visibility: 'shared',
  createdAt: '2026-01-15T12:00:00.000Z',
  lastReviewedAt: '2026-08-01T12:00:00.000Z',
  plainText: 'Compute stays scarce through 2027.',
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Compute stays scarce through 2027.' }] }]
  },
  sourceRefs: [{
    _id: 'src-public',
    objectId: 'article-LEAK-42',
    type: 'article',
    title: 'DOE capacity report',
    url: 'https://example.com/doe-capacity',
    snippet: PASSAGE,
    quote: PASSAGE
  }],
  claims: [{ claimId: 'c1', text: 'UNPUBLISHED_WIKI_CLAIM', confidence: 0.9 }],
  discussions: [{ question: 'PRIVATE_DISCUSSION_Q', answer: 'PRIVATE_DISCUSSION_A' }],
  aiState: { lastError: 'PRIVATE_AGENT_ERROR', lastCandidateSummary: 'UNPUBLISHED_CANDIDATE' },
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    bornAt: '2026-01-15T12:00:00.000Z',
    confidence: 0.87,
    why: [{ text: 'PRIVATE_NOTE_WHY_LEAK' }],
    against: [{ text: 'PRIVATE_NOTE_AGAINST_LEAK' }],
    verdicts: [{
      result: 'partly',
      note: 'Capacity eased in two regions.',
      recordedAt: '2026-08-01T12:00:00.000Z',
      evidenceSourceRefIds: ['src-public']
    }],
    outcomes: [{
      question: 'Which part survived?',
      answer: 'Training compute stayed scarce.',
      lesson: 'Watch regional easing separately.',
      observedAt: '2026-08-01T12:00:00.000Z',
      recordedAt: '2026-08-01T12:00:00.000Z',
      silence: false
    }],
    clocks: [{
      clock: 'evidence',
      occurredAt: '2026-06-01T00:00:00.000Z',
      recordedAt: '2026-06-02T00:00:00.000Z',
      precision: 'day',
      authoredBy: 'world',
      sourceLabel: 'DOE capacity report',
      summary: 'The world published the capacity print.'
    }]
  },
  freshness: {
    acceptedThrough: {
      title: 'DOE capacity report accepted',
      acceptedAt: '2026-07-15T00:00:00.000Z',
      url: 'https://example.com/doe-capacity'
    }
  }
};

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return Promise.resolve(this.value ? JSON.parse(JSON.stringify(this.value)) : this.value); }
  then(resolve, reject) { return this.lean().then(resolve, reject); }
}

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const serve = async ({ pages = [stuffed], revisions = [], lineage = [] } = {}) => {
  const created = [];
  const app = express();
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'reader-1' };
      next();
    },
    WikiPage: {
      findOne: (query) => {
        const match = pages.find((page) => (
          String(page._id) === String(query._id || '')
          || String(page.slug) === String(query.slug || '')
        ));
        if (query.visibility === 'shared' && match && match.visibility !== 'shared') {
          return new Query(null);
        }
        return new Query(match || null);
      },
      find: () => new Query([]),
      create: async (row) => row
    },
    WikiRevision: {
      find: () => new Query(revisions)
    },
    CasebookLineage: {
      findOne: async () => lineage[0] || null,
      find: async () => lineage.filter((row) => row.action !== 'follow'),
      create: async (row) => {
        created.push(row);
        return row;
      }
    }
  }));
  const server = await listen(app);
  return { server, base: `http://127.0.0.1:${server.address().port}`, created };
};

const leaks = [
  'owner-secret-uid-99',
  'PRIVATE_NOTE_WHY_LEAK',
  'PRIVATE_NOTE_AGAINST_LEAK',
  'PRIVATE_DISCUSSION_Q',
  'PRIVATE_AGENT_ERROR',
  'UNPUBLISHED_CANDIDATE',
  'UNPUBLISHED_WIKI_CLAIM',
  'article-LEAK-42',
  'LIBRARY_HIGHLIGHT_PASSAGE',
  '0.87'
];

const run = async () => {
  const { server, base } = await serve({
    revisions: [{
      promotionStatus: 'promoted',
      createdAt: '2026-08-02T12:00:00.000Z',
      summary: 'Recorded the partial verdict.',
      reason: 'user_edit'
    }]
  });
  try {
    const shared = await fetch(`${base}/api/public/wiki/pages/compute-stays-scarce`);
    assert.strictEqual(shared.status, 200);
    const payload = await shared.json();
    assert.ok(payload.casebook, 'the public page must carry a casebook');
    assert.strictEqual(payload.casebook.claim.text, 'Compute stays scarce through 2027.');
    assert.strictEqual(payload.page.judgment, undefined);
    const wire = JSON.stringify(payload);
    leaks.forEach((token) => {
      assert.ok(!wire.includes(token), `leaked ${token}`);
    });
    assert.ok(wire.includes('https://example.com/doe-capacity'));
    assert.ok(!payload.page.sourceRefs[0].snippet);

    const exported = await fetch(`${base}/api/public/wiki/pages/compute-stays-scarce/export`);
    assert.strictEqual(exported.status, 200);
    const sealed = (await exported.json()).casebook;
    assert.strictEqual(sealed.seal.algorithm, 'hmac-sha256');
    assert.strictEqual(verifyCasebook(sealed, { secret: SECRET }).ok, true);

    const verifyOk = await fetch(`${base}/api/public/casebook/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ casebook: sealed })
    });
    assert.strictEqual(verifyOk.status, 200);
    assert.strictEqual((await verifyOk.json()).ok, true);

    const tampered = JSON.parse(JSON.stringify(sealed));
    tampered.claim.text = 'Compute is abundant.';
    const verifyBad = await fetch(`${base}/api/public/casebook/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ casebook: tampered })
    });
    assert.strictEqual(verifyBad.status, 409);
    assert.strictEqual((await verifyBad.json()).ok, false);

    const preview = await fetch(`${base}/api/wiki/pages/${PAGE_ID}/public-preview`);
    assert.strictEqual(preview.status, 200);
    const previewBody = await preview.json();
    assert.strictEqual(previewBody.preview, true);
    assert.strictEqual(previewBody.casebook.claim.text, stuffed.judgment.currentJudgment);
    leaks.forEach((token) => {
      assert.ok(!JSON.stringify(previewBody).includes(token), `preview leaked ${token}`);
    });

    const follow = await fetch(`${base}/api/public/wiki/pages/compute-stays-scarce/follow`, { method: 'POST' });
    assert.ok([200, 201].includes(follow.status), `follow status ${follow.status}`);
    const followBody = await follow.json();
    assert.strictEqual(followBody.action, 'follow');
    assert.ok(followBody.origin.hash);
    assert.strictEqual(followBody.origin.slug, 'compute-stays-scarce');

    const folio = serializePublicCasebook({ page: stuffed });
    assert.ok(folio);
    assert.strictEqual(serializePublicWikiPage(stuffed).judgment, undefined);
    const signed = signCasebook(folio, { secret: SECRET });
    assert.strictEqual(verifyCasebook(signed, { secret: SECRET }).ok, true);

    console.log('ok - public casebook share does not leak');
  } finally {
    server.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
