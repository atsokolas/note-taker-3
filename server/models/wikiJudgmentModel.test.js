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

assert.deepStrictEqual(thesis.judgment.why, []);
assert.deepStrictEqual(thesis.judgment.against, []);

// The two human-labelled reason lists persist with their provenance.
const reasoned = new WikiPage({
  ...base(),
  judgment: {
    kind: 'thesis',
    governingQuestion: 'What would change this QA thesis?',
    why: [{ reasonId: 'why-1', text: 'Demand compounds faster than supply.' }],
    against: [{ reasonId: 'against-1', text: 'In-house silicon is growing.', acceptedFrom: 'event-1' }]
  }
});
assert.strictEqual(reasoned.validateSync(), undefined);
assert.strictEqual(reasoned.judgment.why[0].text, 'Demand compounds faster than supply.');
assert.strictEqual(reasoned.judgment.against[0].acceptedFrom, 'event-1');

const untextedReason = new WikiPage({
  ...base(),
  judgment: {
    kind: 'thesis',
    governingQuestion: 'Question?',
    why: [{ reasonId: 'why-1' }]
  }
});
assert.ok(untextedReason.validateSync()?.errors?.['judgment.why.0.text']);

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
