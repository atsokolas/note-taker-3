const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isHumanOnlyWikiArtifact,
  isResearchEditionPage,
  isResearchOperatingLedgerPage,
  isWeekendReadingsPage
} = require('./wikiProtectedArtifactService');

test('research edition protection covers Weekend Readings and This Week in AI without broadening ledgers', () => {
  const weekend = { createdFrom: { label: 'weekend-readings:owner:2026-07-01:2026-07-14' } };
  const aiWeekly = { createdFrom: { label: 'this-week-in-ai:owner:2026-07-20:2026-07-26' } };
  const ledger = { createdFrom: { label: 'research-ledger:owner:2026-07' } };
  assert.equal(isWeekendReadingsPage(weekend), true);
  assert.equal(isWeekendReadingsPage(aiWeekly), false);
  assert.equal(isResearchEditionPage(weekend), true);
  assert.equal(isResearchEditionPage(aiWeekly), true);
  assert.equal(isResearchEditionPage(ledger), false);
  assert.equal(isHumanOnlyWikiArtifact(aiWeekly), true);
  assert.equal(isResearchOperatingLedgerPage(ledger), true);
});
