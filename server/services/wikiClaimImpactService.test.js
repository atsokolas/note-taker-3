const assert = require('assert');
const {
  claimImpactSummary,
  diffRevisionClaims,
  impactRegister
} = require('./wikiClaimImpactService');

const impacts = diffRevisionClaims({
  before: { claims: [{ claimId: 'one', text: 'The thesis holds.', support: 'partial' }] },
  after: { claims: [{ claimId: 'one', text: 'The thesis holds.', support: 'conflicted' }] }
});

assert.strictEqual(impacts.length, 1);
assert.strictEqual(impactRegister(impacts), 'cuts_against');
assert.strictEqual(claimImpactSummary(impacts), '1 claim touched · 1 contradicted');
assert.deepStrictEqual(diffRevisionClaims({ before: { claims: [] }, after: { claims: [] } }), []);

console.log('wikiClaimImpactService tests passed');
