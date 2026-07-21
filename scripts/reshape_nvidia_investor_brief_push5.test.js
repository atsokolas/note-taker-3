const assert = require('assert');
const mongoose = require('mongoose');
const { applyPush, strictValidate, HEADINGS, QUESTIONS, REWRITES } = require('./reshape_nvidia_investor_brief_push5');

const oid = () => new mongoose.Types.ObjectId();
const claimNode = (claimId, text) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, marks: [{ type: 'claim', attrs: { claimId, support: 'partial', citationIndexes: [1], contradictionIndexes: [] } }] }]
});
const heading = text => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const filler = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const citationId = oid();
const sourceId = oid();
const ledgerClaim = (claimId, text, section) => ({
  claimId, text, section, support: 'partial', citationIds: [citationId], sourceRefIds: [sourceId], history: []
});

const page = {
  _id: oid(), title: 'NVIDIA', slug: 'nvidia', pageType: 'source', plainText: '',
  sourceRefs: [{ _id: sourceId, title: 'Source' }], citations: [{ _id: citationId, sourceRefId: sourceId }],
  claims: [
    ledgerClaim('nvda-thesis-348e7670', 'Old thesis.', HEADINGS.oldIntro),
    ledgerClaim('nvda-method-bfbaf8b2', 'Old method.', HEADINGS.oldIntro)
  ],
  body: {
    type: 'doc', content: [
      heading(HEADINGS.oldIntro),
      claimNode('nvda-thesis-348e7670', 'Old thesis.'),
      claimNode('nvda-method-bfbaf8b2', 'Old method.'),
      heading(HEADINGS.decision), filler('Decision model.'),
      heading(HEADINGS.usefulWork), filler('Useful-work model.'),
      heading(HEADINGS.matched), filler('Matched evidence.'),
      heading(HEADINGS.workload), filler('Workload evidence.'),
      heading('The operating engine'), filler('Operating evidence.')
    ]
  },
  freshness: {}, aiState: {}
};

const result = applyPush({ page, now: new Date('2026-07-20T22:00:00.000Z') });
assert.strictEqual(result.changed, true);
assert.strictEqual(result.rewrittenClaimCount, 2);
assert.strictEqual(result.questionsAdded, 5);
assert.strictEqual(result.reordered, true);
assert.strictEqual(result.candidate.sourceRefs.length, 1);
assert.strictEqual(result.candidate.claims.length, 2);

const headings = result.candidate.body.content.filter(node => node.type === 'heading').map(node => node.content[0].text);
assert.deepStrictEqual(headings.slice(0, 6), [
  HEADINGS.intro, HEADINGS.questions, HEADINGS.matched, HEADINGS.decision, HEADINGS.usefulWork, HEADINGS.workload
]);
assert.ok(QUESTIONS.every(question => result.candidate.plainText.includes(question)));
assert.ok(REWRITES.every(rewrite => result.candidate.plainText.includes(rewrite.text)));

const validation = strictValidate(result.candidate, { validateUpstream: false });
assert.strictEqual(validation.ok, true, JSON.stringify(validation.errors));

const rerun = applyPush({ page: result.candidate, now: new Date('2026-07-20T22:05:00.000Z') });
assert.strictEqual(rerun.changed, false);

console.log('NVIDIA investor-brief Push 5 tests passed');
