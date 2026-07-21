const assert = require('assert');
const mongoose = require('mongoose');
const { applyPush, strictValidate, SECTION, SOURCES } = require('./enrich_nvidia_matched_workload_push4');

const oid = () => new mongoose.Types.ObjectId();
const existingSources = SOURCES.map(row => ({
  _id: oid(), title: row.title, url: row.url,
  citationLabel: row.key.toUpperCase(), metadata: { evidenceKey: row.key }
}));
const citations = existingSources.map(source => ({
  _id: oid(), sourceRefId: source._id, sourceTitle: source.title, url: source.url
}));
const claimNode = (claimId, text) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, marks: [{ type: 'claim', attrs: { claimId, support: 'partial', citationIndexes: [1], contradictionIndexes: [] } }] }]
});

const page = {
  _id: oid(), title: 'NVIDIA', slug: 'nvidia', pageType: 'source', plainText: '',
  sourceRefs: existingSources, citations,
  claims: [{ claimId: 'nvda-push3-useful-work-unit', text: 'Existing Push 3 claim.', section: 'Existing', support: 'partial', citationIds: [citations[0]._id], sourceRefIds: [existingSources[0]._id], history: [] }],
  body: {
    type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The unit that matters: cost per accepted unit of work' }] },
      claimNode('nvda-push3-useful-work-unit', 'Existing Push 3 claim.'),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Workload boundaries, not one AI-compute market' }] }
    ]
  },
  freshness: {}, aiState: {}
};

const result = applyPush({ page, now: new Date('2026-07-20T20:00:00.000Z') });
assert.strictEqual(result.changed, true);
assert.strictEqual(result.addedSourceCount, 0);
assert.strictEqual(result.addedClaimCount, 5);
assert.strictEqual(result.candidate.claims.filter(claim => SECTION.claims.some(expected => expected.id === claim.claimId)).length, 5);
assert.ok(result.candidate.plainText.includes(SECTION.heading));
assert.ok(result.candidate.plainText.includes('$4.01 per GPU-hour'));
assert.ok(!result.candidate.plainText.includes('$0.146'));

const validation = strictValidate(result.candidate, { validateUpstream: false });
assert.strictEqual(validation.ok, true, JSON.stringify(validation.errors));

const rerun = applyPush({ page: result.candidate, now: new Date('2026-07-20T20:05:00.000Z') });
assert.strictEqual(rerun.changed, false);

const tampered = JSON.parse(JSON.stringify(result.candidate));
tampered.claims.find(claim => claim.claimId === 'nvda-push4-price-threshold').text = 'Vultr MI325X $2.00 and $0.146.';
tampered.plainText = `${tampered.plainText}\nVultr MI325X $2.00 and $0.146.`;
const rejected = strictValidate(tampered, { validateUpstream: false });
assert.strictEqual(rejected.ok, false);
assert.ok(rejected.errors.some(error => error.includes('Unverified Vultr pricing')));

console.log('NVIDIA matched-workload Push 4 tests passed');
