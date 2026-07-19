const assert = require('assert');
const mongoose = require('mongoose');
const { WikiPage } = require('./index');

const base = () => ({
  userId: new mongoose.Types.ObjectId(),
  title: 'QA living thesis',
  slug: `qa-living-thesis-${Date.now()}-${Math.random()}`,
  pageType: 'overview'
});

const ordinary = new WikiPage(base());
assert.strictEqual(ordinary.validateSync(), undefined);
assert.strictEqual(ordinary.judgment, null);

const thesis = new WikiPage({
  ...base(),
  judgment: { kind: 'thesis', governingQuestion: 'What would change this QA thesis?' },
  claims: [{ claimId: 'qa-claim', text: 'QA claim' }]
});
assert.strictEqual(thesis.validateSync(), undefined);
assert.deepStrictEqual(thesis.judgment.causalModel, { summary: '', nodes: [], edges: [] });
assert.strictEqual(thesis.claims[0].epistemicStatus, 'plausible_hypothesis');
assert.strictEqual(thesis.claims[0].materiality, 'supporting');

const invalidConfidence = new WikiPage({
  ...base(),
  judgment: { kind: 'thesis', governingQuestion: 'Question?', confidence: 2 }
});
assert.ok(invalidConfidence.validateSync()?.errors?.['judgment.confidence']);

const invalidClaim = new WikiPage({
  ...base(),
  claims: [{ claimId: 'qa-claim', text: 'QA claim', epistemicStatus: 'certain' }]
});
assert.ok(invalidClaim.validateSync()?.errors?.['claims.0.epistemicStatus']);

console.log('wikiJudgmentModel tests passed');
