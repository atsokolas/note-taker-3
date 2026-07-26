const assert = require('assert');
const mongoose = require('mongoose');
const {
  SOURCES,
  applyResearch,
  derived,
  strictValidate
} = require('./enrich_coreweave_decision_dossier');

const oid = () => new mongoose.Types.ObjectId();
const filing = (form, title) => ({
  _id: oid(),
  type: 'external',
  title,
  url: `https://www.sec.gov/${form}`,
  provider: 'sec-edgar',
  metadata: { source: 'sec-edgar', form },
  addedBy: 'ai',
  createdAt: new Date()
});

const page = {
  _id: oid(),
  userId: oid(),
  title: 'CoreWeave, Inc. investment dossier',
  pageType: 'entity',
  sourceScope: 'selected_sources',
  body: { type: 'doc', content: [] },
  plainText: 'Thin filing summary.',
  sourceRefs: [filing('10-Q', 'CRWV Q1 2026 10-Q'), filing('10-K', 'CRWV FY2025 10-K')],
  citations: [],
  claims: [],
  freshness: {},
  aiState: {}
};

const result = applyResearch({ page, now: new Date('2026-07-24T10:00:00.000Z') });
const validation = strictValidate(result.candidate);

assert.strictEqual(validation.ok, true, validation.failures.join('\n'));
assert.strictEqual(result.candidate.investmentDossier.valuation.status, 'complete');
assert.strictEqual(result.candidate.investmentDossier.valuation.unitScale, 'billions');
assert.strictEqual(result.candidate.investmentDossier.valuation.operatingBase.metric, 'revenue');
assert.strictEqual(result.candidate.investmentDossier.valuation.scenarios.length, 3);
assert.strictEqual(result.addedSourceCount, SOURCES.length);
assert.ok(result.candidate.plainText.includes('45.8%'));
assert.ok(result.candidate.plainText.includes('negative $4.711 billion'));
assert.ok(result.candidate.plainText.includes('approximately $44.2 billion of basic equity value'));
assert.ok(result.candidate.plainText.includes('GPU-minutes'));
assert.ok(result.candidate.plainText.includes('working-capital'));
assert.ok(result.candidate.plainText.includes('time-to-capacity'));
assert.ok(result.candidate.claims.every(row => row.sourceRefIds.length && row.citationIds.length));
assert.ok(result.candidate.claims.every(row => row.support !== 'unsupported'));
assert.strictEqual(Number(derived.mlperfGpuMinuteIncrease.toFixed(3)), 0.458);
assert.strictEqual(Number(derived.workingCapitalShareOfOcf.toFixed(3)), 0.676);
assert.strictEqual(Number(derived.equityValue.toFixed(3)), 44.246);

console.log(JSON.stringify({
  ok: true,
  metrics: validation.metrics,
  addedSources: result.addedSourceCount,
  addedClaims: result.addedClaimCount
}, null, 2));
