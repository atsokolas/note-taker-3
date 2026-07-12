const assert = require('assert');
const {
  aggregateComparisonCounts,
  buildWikiMaintenanceReceipt
} = require('./wikiMaintenanceReceiptService');

(() => {
  const comparisons = [
    { outcome: 'accepted', counts: { added: 1, changed: 2, gainedSupport: 1, contradicted: 1, preserved: 4, removed: 0 } },
    { outcome: 'rejected', counts: { added: 0, changed: 1, gainedSupport: 0, contradicted: 0, preserved: 2, removed: 1 } }
  ];
  assert.deepStrictEqual(aggregateComparisonCounts(comparisons), {
    added: 1,
    changed: 3,
    gainedSupport: 1,
    contradicted: 1,
    preserved: 6,
    removed: 1,
    acceptedPages: 1,
    rejectedPages: 1
  });
  const receipt = buildWikiMaintenanceReceipt({
    run: { _id: 'run-1' },
    event: { _id: 'event-1', provider: 'sec-edgar' },
    pages: [{ _id: 'page-1', title: 'Alphabet thesis' }],
    comparisons,
    status: 'needs_review',
    now: new Date('2026-07-11T20:00:00.000Z')
  });
  assert.strictEqual(receipt.id, 'wiki-maintenance:run-1');
  assert.strictEqual(receipt.sourceLabel, 'SEC EDGAR');
  assert.strictEqual(receipt.status, 'needs_review');
  assert.ok(receipt.summary.includes('3 changed'));
  assert.strictEqual(receipt.metrics.claimsContradicted, 1);
  assert.strictEqual(receipt.nextAction.href, '/wiki/workspace?page=page-1');
})();

console.log('wikiMaintenanceReceiptService tests passed');
