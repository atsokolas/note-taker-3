const assert = require('assert');
const mongoose = require('mongoose');
const {
  SOURCES,
  applyResearch,
  derived,
  strictValidate
} = require('./build_costco_decision_dossier');

const page = {
  _id: new mongoose.Types.ObjectId(),
  userId: new mongoose.Types.ObjectId(),
  title: 'Costco Wholesale investment dossier',
  pageType: 'entity',
  createdFrom: { label: 'company-dossier:COST' },
  externalWatches: {
    edgar: {
      ticker: 'COST',
      cik: '0000909832',
      companyName: 'Costco Wholesale Corporation',
      status: 'active'
    }
  },
  body: { type: 'doc', content: [] },
  plainText: '',
  sourceRefs: [],
  citations: [],
  claims: [],
  freshness: {},
  aiState: {},
  judgment: {
    kind: 'thesis',
    governingQuestion: 'Can Costco compound owner value above a 10% annual hurdle over five years from the current price?',
    currentJudgment: '',
    status: 'researching',
    decisionPosture: 'investigate',
    strongestCounterargument: 'A wonderful business can remain a poor security if cash growth cannot outrun the starting valuation.',
    causalModel: {
      summary: 'Member surplus drives renewal; renewal and volume concentrate purchasing; turns and supplier terms fund price; price reinforces member surplus.',
      nodes: [],
      edges: []
    },
    assumptions: [],
    unknowns: [],
    falsifiers: [],
    decisions: []
  }
};

const result = applyResearch({ page, now: new Date('2026-07-24T23:47:58.000Z') });
const validation = strictValidate(result.candidate);

assert.strictEqual(validation.ok, true, validation.failures.join('\n'));
assert.strictEqual(result.addedSourceCount, SOURCES.length);
assert(result.addedClaimCount >= 30);
assert.strictEqual(result.candidate.investmentDossier.version, 2);
assert.strictEqual(result.candidate.investmentDossier.businessModel.primary, 'membership_retail');
assert.strictEqual(result.candidate.investmentDossier.researchPlan.status, 'decision_ready');
assert.strictEqual(result.candidate.judgment, undefined);
assert(result.candidate.plainText.includes('matched-SKU basket'));
assert(result.candidate.plainText.includes('supplier financing'));
assert(result.candidate.plainText.includes('Executive-to-non-Executive spend ratio'));
assert(!result.candidate.plainText.includes('GPU'));
assert(result.candidate.claims.every(row => row.support !== 'unsupported'));
assert(result.candidate.claims.every(row => row.sourceRefIds.length && row.citationIds.length));
assert.strictEqual(Number(derived.inventoryTurns.toFixed(1)), 13.1);
assert.strictEqual(Number(derived.executiveToNonExecutiveSpendRatio.toFixed(1)), 3.0);
assert(derived.requiredFcfCagr35x > 0.15 && derived.requiredFcfCagr35x < 0.18);

console.log(JSON.stringify({
  ok: true,
  metrics: validation.metrics,
  sources: result.addedSourceCount,
  claims: result.addedClaimCount
}, null, 2));
