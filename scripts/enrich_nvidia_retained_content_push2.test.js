const assert = require('assert');
const mongoose = require('mongoose');
const {
  applyPush, strictValidate, REMOVE_CLAIMS, REWRITES, SECTIONS, SOURCES
} = require('./enrich_nvidia_retained_content_push2');

const existingKeys = [
  'fy26', 'q1', 'cuda-guide', 'rack-networking', 'mlperf', 'splitwise', 'distserve',
  'aws-trn2', 'google-tpu', 'nvlink-fusion'
];
const sources = existingKeys.map((key, index) => ({
  _id: new mongoose.Types.ObjectId(), type: 'external', title: key,
  url: `https://example.com/${key}`, citationLabel: key.toUpperCase(),
  metadata: { evidenceKey: key }, createdAt: new Date(index)
}));
const citations = sources.map(source => ({
  _id: new mongoose.Types.ObjectId(), sourceRefId: source._id, sourceType: 'external',
  sourceTitle: source.title, url: source.url, confidence: 1
}));

const requiredRegradeIds = [
  'nvda-product-system-not-chip', 'nvda-product-vertical-range',
  'nvda-networking-moat', 'nvda-benchmark-boundary'
];
const fixtureIds = [...new Set([
  ...requiredRegradeIds, ...REMOVE_CLAIMS, ...REWRITES.map(row => row.id)
])];
const claims = fixtureIds.map((claimId, index) => ({
  claimId, text: `Existing claim ${claimId}.`, section: 'Existing section',
  support: requiredRegradeIds.includes(claimId) ? 'partial' : 'supported',
  citationIds: [citations[index % citations.length]._id],
  sourceRefIds: [sources[index % sources.length]._id],
  contradictedByCitationIds: [], history: []
}));
const body = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The underwriting question' }] },
    ...claims.map(claim => ({
      type: 'paragraph',
      content: [{
        type: 'text', text: claim.text,
        marks: [{ type: 'claim', attrs: { claimId: claim.claimId, support: claim.support, citationIndexes: [1], contradictionIndexes: [] } }]
      }]
    })),
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What NVIDIA actually sells' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The operating engine' }] }
  ]
};
const page = {
  _id: new mongoose.Types.ObjectId(), title: 'NVIDIA’s AI engine—and the obligations underneath it',
  slug: 'nvidia', pageType: 'source', status: 'published', visibility: 'shared', body,
  plainText: 'Existing article.', sourceRefs: sources, citations, claims,
  freshness: { acceptedThrough: { sourceEventId: 'filing', title: 'NVIDIA 8-K' } },
  publicProof: { grade: 'proven' }, aiState: { changeLog: [] }
};

const result = applyPush({ page, now: new Date('2026-07-19T21:00:00.000Z') });
assert.strictEqual(result.changed, true);
assert.strictEqual(result.addedSourceCount, SOURCES.length);
assert.strictEqual(result.removedClaimCount, REMOVE_CLAIMS.length);
assert.strictEqual(result.rewrittenClaimCount, REWRITES.length);
assert.strictEqual(result.addedClaimCount, SECTIONS.flatMap(section => section.claims).length);
assert.deepStrictEqual(result.candidate.freshness.acceptedThrough, page.freshness.acceptedThrough);
REMOVE_CLAIMS.forEach(claimId => {
  assert.strictEqual(result.candidate.claims.some(claim => claim.claimId === claimId), false);
});
REWRITES.forEach(rewrite => {
  const claim = result.candidate.claims.find(row => row.claimId === rewrite.id);
  assert.strictEqual(claim.text, rewrite.text);
  assert.strictEqual(claim.support, rewrite.support);
});
const strict = strictValidate(result.candidate);
assert.strictEqual(strict.ok, true, strict.errors.join('\n'));
assert.strictEqual(strict.citedClaimCount, strict.claimCount);
const headings = result.candidate.body.content
  .filter(node => node.type === 'heading')
  .map(node => node.content[0].text);
assert.ok(headings.includes('Who controls the rack after the accelerator changes?'));
assert.strictEqual(headings.includes('What NVIDIA actually sells'), false);

const replay = applyPush({ page: result.candidate, now: new Date('2026-07-19T22:00:00.000Z') });
assert.strictEqual(replay.changed, false);

const broken = JSON.parse(JSON.stringify(result.candidate));
broken.claims.find(claim => claim.claimId === 'nvda-push2-retained-index').text = 'An unsupported estimate.';
assert.strictEqual(strictValidate(broken).ok, false);

console.log('NVIDIA retained-content Push 2 tests passed');
