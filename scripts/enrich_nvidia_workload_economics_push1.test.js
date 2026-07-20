const assert = require('assert');
const mongoose = require('mongoose');
const { applyPush, strictValidate, SECTIONS, SOURCES, REGRADE } = require('./enrich_nvidia_workload_economics_push1');

const makeSource = (key, index) => ({
  _id: new mongoose.Types.ObjectId(), type: 'external', title: key, url: `https://example.com/${key}`,
  citationLabel: key.toUpperCase(), metadata: { evidenceKey: key }, createdAt: new Date(index)
});

const existingKeys = ['fy26', 'q1', 'cuda-guide', 'cuda-x', 'blackwell', 'rack-networking', 'mlperf'];
const sourceRefs = existingKeys.map(makeSource);
const citations = sourceRefs.map(source => ({
  _id: new mongoose.Types.ObjectId(), sourceRefId: source._id, sourceType: 'external',
  sourceTitle: source.title, url: source.url, confidence: 1
}));
const existingClaims = Object.keys(REGRADE).map((claimId, index) => ({
  claimId, text: `Existing mixed claim ${index}.`, section: index < 2 ? 'What NVIDIA actually sells' : 'Networking and co-design turn chips into a platform',
  support: 'supported', citationIds: [citations[0]._id], sourceRefIds: [sourceRefs[0]._id],
  contradictedByCitationIds: [], history: []
}));
const body = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The underwriting question' }] },
    ...existingClaims.map(claim => ({
      type: 'paragraph', content: [{ type: 'text', text: claim.text, marks: [{ type: 'claim', attrs: { claimId: claim.claimId, support: claim.support, citationIndexes: [1], contradictionIndexes: [] } }] }]
    })),
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What NVIDIA actually sells' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The operating engine' }] }
  ]
};
const page = {
  _id: new mongoose.Types.ObjectId(), title: 'NVIDIA’s AI engine—and the obligations underneath it',
  slug: 'nvidia', pageType: 'source', status: 'published', visibility: 'shared', body,
  plainText: 'Existing article.', sourceRefs, citations, claims: existingClaims,
  freshness: { acceptedThrough: { sourceEventId: 'filing', title: 'NVIDIA 8-K' } },
  publicProof: { grade: 'proven' }, aiState: { changeLog: [] }
};

const result = applyPush({ page, now: new Date('2026-07-19T20:00:00.000Z') });
assert.strictEqual(result.changed, true);
assert.strictEqual(result.addedSourceCount, SOURCES.length);
assert.strictEqual(result.addedClaimCount, SECTIONS.flatMap(section => section.claims).length);
assert.strictEqual(result.regradedClaimCount, Object.keys(REGRADE).length);
assert.deepStrictEqual(result.candidate.freshness.acceptedThrough, page.freshness.acceptedThrough);
Object.entries(REGRADE).forEach(([claimId, support]) => {
  assert.strictEqual(result.candidate.claims.find(claim => claim.claimId === claimId).support, support);
});
const strict = strictValidate(result.candidate);
assert.strictEqual(strict.ok, true, strict.errors.join('\n'));
assert.strictEqual(strict.citedClaimCount, strict.claimCount);
const headings = result.candidate.body.content.filter(node => node.type === 'heading').map(node => node.content[0].text);
assert.ok(headings.indexOf('The decision surface: where should NVIDIA lose?') < headings.indexOf('What NVIDIA actually sells'));

const replay = applyPush({ page: result.candidate, now: new Date('2026-07-19T20:30:00.000Z') });
assert.strictEqual(replay.changed, false);

const broken = JSON.parse(JSON.stringify(result.candidate));
broken.claims.find(claim => claim.claimId === 'nvda-push1-retained-content').citationIds = [];
assert.strictEqual(strictValidate(broken).ok, false);

console.log('NVIDIA workload-economics Push 1 tests passed');
