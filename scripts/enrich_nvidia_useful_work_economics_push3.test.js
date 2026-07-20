const assert = require('assert');
const mongoose = require('mongoose');
const { applyPush, strictValidate, SECTION } = require('./enrich_nvidia_useful_work_economics_push3');

const oid = () => new mongoose.Types.ObjectId();
const existingSources = [
  'mlperf-training-method', 'mlperf-power', 'meta-cluster-reliability', 'google-tpu-resiliency',
  'dgx-gb-hardware', 'meta-roce'
].map(key => ({ _id: oid(), title: key, url: `https://example.com/${key}`, citationLabel: key.toUpperCase(), metadata: { evidenceKey: key } }));
const citations = existingSources.map(source => ({ _id: oid(), sourceRefId: source._id, sourceTitle: source.title, url: source.url }));
const claimNode = (claimId, text, section = 'Existing') => ({
  type: 'paragraph',
  content: [{ type: 'text', text, marks: [{ type: 'claim', attrs: { claimId, support: 'partial', citationIndexes: [1], contradictionIndexes: [] } }] }]
});
const ledgerClaim = (claimId, text, section = 'Existing') => ({
  claimId, text, section, support: 'partial', citationIds: [citations[0]._id], sourceRefIds: [existingSources[0]._id], history: []
});

const page = {
  _id: oid(), title: 'NVIDIA', slug: 'nvidia', pageType: 'source', plainText: '',
  sourceRefs: existingSources, citations,
  claims: [
    ledgerClaim('nvda-codesign-economics', 'Old broad co-design claim.', 'Networking and co-design turn chips into a platform'),
    ledgerClaim('nvda-push2-retained-index', 'These are arithmetic scenarios, not estimates or forecasts. R = 3.75. R = 16.00. R = 30.75.', 'An indexed model, not an imaginary bill of materials'),
    ledgerClaim('nvda-push1-falsifiers', 'By July 2028 this weakens if a proxy fails for four consecutive quarters.', 'What would break the thesis')
  ],
  body: {
    type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The decision surface: where should NVIDIA lose?' }] },
      claimNode('nvda-codesign-economics', 'Old broad co-design claim.', 'Networking and co-design turn chips into a platform'),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Six workloads, not one AI-compute market' }] },
      claimNode('nvda-push2-retained-index', 'These are arithmetic scenarios, not estimates or forecasts. R = 3.75. R = 16.00. R = 30.75.'),
      claimNode('nvda-push1-falsifiers', 'By July 2028 this weakens if a proxy fails for four consecutive quarters.')
    ]
  },
  freshness: {}, aiState: {}
};

const result = applyPush({ page, now: new Date('2026-07-20T01:00:00.000Z') });
assert.strictEqual(result.changed, true);
assert.strictEqual(result.addedSourceCount, 0);
assert.strictEqual(result.addedClaimCount, 5);
assert.strictEqual(result.rewrittenClaimCount, 1);
assert.strictEqual(result.candidate.claims.filter(claim => SECTION.claims.some(expected => expected.id === claim.claimId)).length, 5);
assert.ok(result.candidate.plainText.includes('The unit that matters: cost per accepted unit of work'));
assert.ok(result.candidate.plainText.includes('Workload boundaries, not one AI-compute market'));
assert.ok(!result.candidate.plainText.includes('Six workloads, not one AI-compute market'));

const validation = strictValidate(result.candidate, { validateUpstream: false });
assert.strictEqual(validation.ok, true, JSON.stringify(validation.errors));

const rerun = applyPush({ page: result.candidate, now: new Date('2026-07-20T01:05:00.000Z') });
assert.strictEqual(rerun.changed, false);

console.log('NVIDIA useful-work Push 3 tests passed');
