const assert = require('assert');
const { assessEventAgainstClaims } = require('./wikiEvidenceRelevanceService');

(() => {
  const direct = assessEventAgainstClaims({
    event: {
      text: 'Google Services operating income increased to $30 billion as advertising revenue and operating cash flow remained strong during the quarter.'
    },
    claims: [{
      claimId: 'claim-1',
      section: 'Evidence',
      text: 'Google Services operating income increased to $30 billion while advertising revenue and operating cash flow remained strong.'
    }]
  });
  assert.strictEqual(direct.decision, 'direct_claim_matches');
  assert.strictEqual(direct.directMatchCount, 1);
  assert.strictEqual(direct.matches[0].claimId, 'claim-1');

  const numericMismatch = assessEventAgainstClaims({
    event: {
      text: 'Google Services operating income increased to $18 billion as advertising revenue remained strong.'
    },
    claims: [{
      claimId: 'claim-2',
      text: 'Google Services operating income increased to $30 billion as advertising revenue remained strong.'
    }]
  });
  assert.strictEqual(numericMismatch.decision, 'no_direct_claim_match');

  const unrelated = assessEventAgainstClaims({
    event: { text: 'The board appointed a new chief accounting officer effective June 2.' },
    claims: [{
      claimId: 'claim-3',
      text: 'Advertising cash flow funds long-duration artificial intelligence research and strategic acquisitions.'
    }]
  });
  assert.strictEqual(unrelated.decision, 'no_direct_claim_match');
})();

console.log('wikiEvidenceRelevanceService tests passed');
