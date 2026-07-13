const assert = require('assert');
const express = require('express');
const { buildWikiRouter } = require('../wikiRoutes');

const pageId = '507f1f77bcf86cd799439011';
const filingId = '507f1f77bcf86cd799439012';
const transcriptId = '507f1f77bcf86cd799439013';
const filingRevisionId = '507f1f77bcf86cd799439014';
const transcriptRevisionId = '507f1f77bcf86cd799439015';

class Query {
  constructor(value) { this.value = value; }
  lean() { return Promise.resolve(JSON.parse(JSON.stringify(this.value))); }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const page = {
  _id: pageId,
  userId: 'user-1',
  title: 'Alphabet allocator dossier',
  slug: 'alphabet-allocator',
  pageType: 'entity_dossier',
  status: 'published',
  visibility: 'shared',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alphabet allocates capital.' }] }] },
  plainText: 'Alphabet allocates capital.',
  sourceRefs: [{ title: 'Alphabet 10-K' }, { title: 'Alphabet earnings transcript' }],
  claims: [{ claimId: 'claim-1', text: 'Alphabet allocates capital.' }],
  freshness: {
    acceptedThrough: {
      sourceEventId: filingId,
      title: 'Alphabet accepted filing',
      url: 'https://www.sec.gov/Archives/alphabet',
      sourceUpdatedAt: '2026-07-12T00:00:00.000Z'
    }
  },
  aiState: {
    changeLog: [{ type: 'maintenance', text: 'Accepted Alphabet evidence.', createdAt: '2026-07-12T00:00:00.000Z' }]
  },
  publicProof: { grade: 'acceptance_in_progress' },
  toObject() { return JSON.parse(JSON.stringify({ ...this, toObject: undefined, save: undefined, markModified: undefined })); },
  markModified() {},
  async save() { this.saved = true; return this; }
};

const events = [{
  _id: filingId,
  userId: 'user-1',
  provider: 'sec-edgar',
  status: 'processed',
  affectedPageIds: [pageId],
  url: 'https://www.sec.gov/Archives/alphabet',
  text: 'Substantive filing evidence. '.repeat(5)
}, {
  _id: transcriptId,
  userId: 'user-1',
  provider: 'fmp-transcripts',
  status: 'processed',
  affectedPageIds: [pageId],
  text: 'Substantive earnings transcript evidence. '.repeat(5)
}];

const existingRevisions = [{
  _id: filingRevisionId,
  userId: 'user-1',
  pageId,
  sourceEventId: filingId,
  promotionStatus: 'promoted',
  reason: 'source_event'
}, {
  _id: transcriptRevisionId,
  userId: 'user-1',
  pageId,
  sourceEventId: transcriptId,
  promotionStatus: 'promoted',
  reason: 'source_event'
}];

const WikiPage = { findOne: () => new Query(page) };
const WikiSourceEvent = { find: () => new Query(events) };
function WikiRevision(payload) { Object.assign(this, payload); }
WikiRevision.created = [];
WikiRevision.find = () => new Query(existingRevisions);
WikiRevision.prototype.save = async function save() { WikiRevision.created.push(this); return this; };

const request = async (base, body) => {
  const response = await fetch(`${base}/api/wiki/pages/${pageId}/public-proof/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
};

const acceptanceBody = {
  acceptedClocks: [
    { sourceEventId: filingId, revisionId: filingRevisionId },
    { sourceEventId: transcriptId, revisionId: transcriptRevisionId }
  ],
  reason: 'Both authoritative clocks and their claim deltas passed editorial review.'
};

const run = async () => {
  const app = express();
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
    WikiPage,
    WikiSourceEvent,
    WikiRevision
  }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const preview = await request(base, acceptanceBody);
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.body.dryRun, true);
    assert.strictEqual(preview.body.ready, true);
    assert.strictEqual(page.publicProof.grade, 'acceptance_in_progress');
    assert.ok(!JSON.stringify(preview.body).includes(filingId));

    const unconfirmed = await request(base, { ...acceptanceBody, confirm: true });
    assert.strictEqual(unconfirmed.status, 400);
    assert.strictEqual(page.publicProof.grade, 'acceptance_in_progress');

    const confirmed = await request(base, {
      ...acceptanceBody,
      confirm: true,
      decision: 'accept_alphabet_public_proof'
    });
    assert.strictEqual(confirmed.status, 200);
    assert.strictEqual(confirmed.body.dryRun, false);
    assert.strictEqual(page.publicProof.grade, 'proven');
    assert.strictEqual(page.publicProof.acceptedClocks.length, 2);
    assert.strictEqual(WikiRevision.created.length, 1);

    const replay = await request(base, {
      ...acceptanceBody,
      confirm: true,
      decision: 'accept_alphabet_public_proof'
    });
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(replay.body.unchanged, true);
    assert.strictEqual(WikiRevision.created.length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => console.log('wikiRoutes public proof acceptance tests passed'))
    .catch(error => { console.error(error); process.exit(1); });
}

module.exports = { run };
