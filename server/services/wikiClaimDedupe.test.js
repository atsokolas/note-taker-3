const { __testables } = require('./wikiMaintenanceService');

describe('wiki claim write-time dedupe', () => {
  test('coalesces case, whitespace, and punctuation variants before persistence', () => {
    const claims = __testables.coalesceEquivalentClaims([
      {
        claimId: 'first',
        text: 'AI compute is changing by orders of magnitude.',
        citationIds: ['citation-a'],
        sourceRefIds: ['source-a']
      },
      {
        claimId: 'duplicate',
        text: '  ai COMPUTE is changing by orders of magnitude! ',
        citationIds: ['citation-b'],
        sourceRefIds: ['source-b']
      }
    ]);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      claimId: 'first',
      citationIds: ['citation-a', 'citation-b'],
      sourceRefIds: ['source-a', 'source-b']
    });
  });
});
