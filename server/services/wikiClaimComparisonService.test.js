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

(() => {
  const result = compareClaimLedgers({
    beforeClaims: [
      claim('old-run', 'Start from package evidence and keep root commands distinct from nested UI commands. Run the API, run the UI only for UI work, prove wiki behavior, then build the frontend.', 'supported', { sourceRefIds: ['package.json'] }),
      claim('stable-peer', 'The public share route excludes private graph state.', 'supported', { sourceRefIds: ['wikiRoutes.js'] })
    ],
    afterClaims: [
      claim('new-run', 'Start from package evidence and keep root commands distinct from nested package commands. Install with the declared package manager, run the narrow package, prove behavior, then build before shipping.', 'supported', { sourceRefIds: ['package.json'] }),
      claim('new-peer-id', 'The public share route excludes private graph state.', 'supported', { sourceRefIds: ['wikiRoutes.js'] })
    ]
  });
  assert.strictEqual(result.counts.added, 0);
  assert.strictEqual(result.counts.changed, 1);
  assert.strictEqual(result.counts.preserved, 1);
  assert.strictEqual(result.counts.removed, 0);
  assert.strictEqual(result.deltas.changed[0].before.claimId, 'old-run');
  assert.strictEqual(result.deltas.changed[0].after.claimId, 'new-run');
})();

(() => {
  const result = compareClaimLedgers({
    beforeClaims: [claim('old', 'The API uses Express routes for wiki maintenance.', 'supported', { sourceRefIds: ['wikiRoutes.js'] })],
    afterClaims: [claim('new', 'The frontend uses calm index components for concepts.', 'supported', { sourceRefIds: ['wikiRoutes.js'] })]
  });
  assert.strictEqual(result.counts.changed, 0);
  assert.strictEqual(result.counts.added, 1);
  assert.strictEqual(result.counts.removed, 1);
})();

(() => {
  const result = compareClaimLedgers({
    beforeClaims: [claim('old-short', 'Run focused tests before shipping.', 'supported', { sourceRefIds: ['package.json'] })],
    afterClaims: [claim('new-short', 'Run relevant tests before shipping.', 'supported', { sourceRefIds: ['package.json'] })]
  });
  assert.strictEqual(result.counts.changed, 0);
  assert.strictEqual(result.counts.added, 1);
  assert.strictEqual(result.counts.removed, 1);
})();

(() => {
  const shared = { sourceRefIds: ['package.json'] };
  const result = compareClaimLedgers({
    beforeClaims: [
      claim('old-a', 'The package workflow runs focused tests and builds the frontend before every production deployment.', 'supported', shared),
      claim('old-b', 'The package workflow runs targeted tests and builds the frontend before each production deployment.', 'supported', shared)
    ],
    afterClaims: [claim('new', 'The package workflow runs relevant tests and builds the frontend before a production deployment.', 'supported', shared)]
  });
  assert.strictEqual(result.counts.changed, 0);
  assert.strictEqual(result.counts.added, 1);
  assert.strictEqual(result.counts.removed, 2);
})();

(() => {
  const shared = { sourceRefIds: ['wikiRoutes.js'], section: 'User experience map' };
  const result = compareClaimLedgers({
    beforeClaims: [claim('baseline-create', 'Create repo wiki: user pastes a GitHub URL.', 'supported', shared)],
    afterClaims: [
      claim('current-create', 'Create', 'supported', shared),
      claim('current-create', 'repo wiki', 'supported', shared),
      claim('current-create', ': user pastes a GitHub URL.', 'supported', shared)
    ]
  });
  assert.strictEqual(result.reviewedClaimCount, 1);
  assert.strictEqual(result.counts.added, 0);
  assert.strictEqual(result.counts.changed, 0);
  assert.strictEqual(result.counts.preserved, 1);
  assert.strictEqual(result.counts.removed, 0);
  assert.strictEqual(result.deltas.preserved[0].after.text, 'Create repo wiki: user pastes a GitHub URL.');
})();

console.log('wikiClaimComparisonService tests passed');
