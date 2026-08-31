const assert = require('assert');
const { auditJudgmentLedgerJourney } = require('./judgmentLedgerAcceptanceService');

const fixture = require('../../scripts/fixtures/judgment-ledger-journey.json');

const passing = auditJudgmentLedgerJourney(fixture);
assert.strictEqual(passing.passed, true);
assert.deepStrictEqual(passing.failures, []);

const missingReceipt = auditJudgmentLedgerJourney({
  ...fixture,
  receipts: fixture.receipts.filter(row => row.kind !== 'judgment_verdict_recorded')
});
assert.strictEqual(missingReceipt.passed, false);
assert.ok(missingReceipt.failures.includes('verdictReceiptRetained'));

const missingEvidence = auditJudgmentLedgerJourney({
  ...fixture,
  page: {
    ...fixture.page,
    judgment: {
      ...fixture.page.judgment,
      verdicts: fixture.page.judgment.verdicts.map(row => ({ ...row, evidenceSourceRefIds: [] }))
    }
  }
});
assert.strictEqual(missingEvidence.passed, false);
assert.ok(missingEvidence.failures.includes('verdictEvidenceBound'));

console.log('judgmentLedgerAcceptanceService tests passed');
