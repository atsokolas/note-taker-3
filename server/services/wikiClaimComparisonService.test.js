const assert = require('assert');
const { compareClaimLedgers } = require('./wikiClaimComparisonService');

const claim = (claimId, text, support = 'unsupported', extra = {}) => ({
  claimId,
  text,
  section: 'Thesis',
  support,
  citationIds: [],
  sourceRefIds: [],
  contradictedByCitationIds: [],
  ...extra
});

(() => {
  const result = compareClaimLedgers({
    beforeClaims: [
      claim('preserved', 'This claim remains true.', 'supported', { citationIds: ['c1'] }),
      claim('evidence-refresh', 'The API entrypoint remains stable.', 'supported', { sourceRefIds: ['old-path'] }),
      claim('support', 'Capex is rising.', 'partial', { citationIds: ['c2'] }),
      claim('contradiction', 'Margins will expand.', 'supported', { citationIds: ['c3'] }),
      claim('rewrite', 'The old wording.', 'partial'),
      claim('removed', 'This claim disappears.', 'unsupported')
    ],
    afterClaims: [
      claim('preserved', 'This claim remains true.', 'supported', { citationIds: ['c1'] }),
      claim('evidence-refresh', 'The API entrypoint remains stable.', 'supported', { sourceRefIds: ['new-path'] }),
      claim('support', 'Capex is rising.', 'supported', { citationIds: ['c2', 'c4'] }),
      claim('contradiction', 'Margins will expand.', 'conflicted', {
        citationIds: ['c3', 'c5'],
        contradictedByCitationIds: ['c5']
      }),
      claim('rewrite', 'The current wording.', 'partial'),
      claim('added', 'A newly supported claim.', 'supported', { citationIds: ['c6'] })
    ]
  });
  assert.deepStrictEqual(result.counts, {
    added: 1,
    changed: 3,
    evidenceRefreshed: 3,
    gainedSupport: 1,
    contradicted: 1,
    preserved: 2,
    removed: 1
  });
  assert.strictEqual(result.materialChangeCount, 5);
  assert.strictEqual(result.reviewedClaimCount, 6);
  assert.strictEqual(result.deltas.evidenceRefreshed[0].after.claimId, 'evidence-refresh');
  assert.strictEqual(result.deltas.gainedSupport[0].after.claimId, 'support');
  assert.strictEqual(result.deltas.contradicted[0].after.claimId, 'contradiction');
})();

(() => {
  const result = compareClaimLedgers({
    beforeClaims: [claim('', 'Spacing and punctuation should still match.', 'partial')],
    afterClaims: [claim('new-id', 'Spacing—and punctuation should still match!', 'partial')],
    outcome: 'rejected'
  });
  assert.strictEqual(result.outcome, 'rejected');
  assert.strictEqual(result.counts.added, 0);
  assert.strictEqual(result.counts.changed, 0);
  assert.strictEqual(result.counts.evidenceRefreshed, 0);
  assert.strictEqual(result.counts.preserved, 1);
  assert.strictEqual(result.counts.removed, 0);
})();

console.log('wikiClaimComparisonService tests passed');
