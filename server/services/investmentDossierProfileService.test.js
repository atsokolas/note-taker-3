const assert = require('assert');
const {
  BUSINESS_MODEL_ADAPTERS,
  CORE_ANALYSIS_MODULES,
  classifyBusinessModel,
  completeResearchPlan,
  inferEvidenceArchetype,
  upgradeInvestmentDossierProfile
} = require('./investmentDossierProfileService');

const now = new Date('2026-07-24T12:00:00.000Z');
const classified = classifyBusinessModel({
  companyName: 'Costco Wholesale Corporation',
  ticker: 'COST',
  sourceText: 'The membership warehouse reports renewal rates and membership fee revenue.'
});
assert.strictEqual(classified.primary, 'membership_retail');
assert(classified.confidence > 0.5);

const initial = upgradeInvestmentDossierProfile({
  profile: {
    company: { name: 'Costco Wholesale Corporation', ticker: 'COST', cik: '909832' }
  },
  candidates: [{
    title: 'Costco 2025 10-K',
    provider: 'sec-edgar',
    metadata: { form: '10-K' },
    text: 'Membership warehouse renewal rate and membership fee revenue.'
  }],
  now
});
assert.strictEqual(initial.version, 2);
assert.strictEqual(initial.businessModel.primary, 'membership_retail');
assert(initial.researchPlan.requiredModuleIds.includes('membership_economics'));
assert(initial.researchPlan.requiredModuleIds.includes('inventory_working_capital'));
assert(initial.researchPlan.evidenceArchetypes.includes('filing'));
assert.strictEqual(initial.researchPlan.status, 'research_incomplete');

const required = initial.researchPlan.requiredModuleIds;
const completed = completeResearchPlan({
  profile: initial,
  businessModel: 'membership_retail',
  evidenceArchetypes: initial.researchPlan.requiredEvidenceArchetypes,
  modules: required.map(id => ({
    id,
    status: 'complete',
    claimIds: [`claim-${id}`],
    calculationIds: ['reverse_expectations', 'unit_economics_cash_conversion'].includes(id)
      ? [`calculation-${id}`]
      : [],
    sourceRefIds: [`source-${id}`]
  })),
  insights: [{
    id: 'membership-flywheel',
    text: 'A reproducible membership-fee bridge shows how price investment can coexist with operating-profit growth.',
    reproducible: true,
    sourceRefIds: ['source-filing', 'source-membership']
  }],
  now
});
assert.strictEqual(completed.researchPlan.status, 'decision_ready');
assert.deepStrictEqual(completed.researchPlan.missingModuleIds, []);
assert.deepStrictEqual(completed.researchPlan.missingEvidenceArchetypes, []);
assert.strictEqual(BUSINESS_MODEL_ADAPTERS.membership_retail.label, 'Membership retail');
assert(CORE_ANALYSIS_MODULES.includes('competitive_substitution'));
assert.strictEqual(inferEvidenceArchetype({
  title: 'Costco market snapshot',
  metadata: { marketSnapshot: true }
}), 'market_snapshot');

console.log('investmentDossierProfileService tests passed');
