const assert = require('assert');
const {
  BUSINESS_MODEL_ADAPTERS,
  CORE_ANALYSIS_MODULES,
  classifyBusinessModel,
  compileInvestmentDossierResearchPlan,
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

const deereSources = [
  { _id: 'filing', title: 'Deere 2025 10-K', provider: 'sec-edgar', metadata: { form: '10-K' } },
  {
    _id: 'product',
    title: 'John Deere precision agriculture product documentation',
    snippet: 'Deere manufactures industrial and agricultural equipment through a dealer network and installed base.',
    metadata: { evidenceArchetype: 'company_product' }
  },
  { _id: 'competitor', title: 'AGCO competitor annual filing', metadata: { evidenceArchetype: 'competitor_primary' } },
  { _id: 'benchmark', title: 'USDA agriculture benchmark', metadata: { evidenceArchetype: 'independent_domain' } },
  { _id: 'market', title: 'Deere market snapshot', metadata: { marketSnapshot: true } },
  { _id: 'operating', title: 'Deere operating benchmark', metadata: { evidenceArchetype: 'operating_benchmark' } }
];
const citedClaim = (claimId, section, text, sourceRefIds = ['filing']) => ({
  claimId,
  section,
  text,
  support: 'supported',
  sourceRefIds
});
const compiledDeere = compileInvestmentDossierResearchPlan({
  profile: { company: { name: 'Deere & Company', ticker: 'DE' } },
  page: {
    externalWatches: { edgar: { companyName: 'Deere & Company', ticker: 'DE' } }
  },
  sourceRefs: deereSources,
  claims: [
    citedClaim('judgment', 'Current Judgment', 'Deere has an industrial equipment and dealer-network advantage.'),
    citedClaim('customer', 'Product and Technical Moat', 'Farm customers buy equipment productivity, uptime, and yield improvement.'),
    citedClaim('moat', 'Product and Technical Moat', 'The installed dealer and precision-software control point raises switching costs.'),
    citedClaim('unit', 'System and Unit Economics', 'Operating cash flow of $8.0 billion divided by $10.0 billion of operating income equals 80% cash conversion.'),
    citedClaim('capital', 'Operating Engine and Capital Allocation', 'Research, manufacturing capacity, and buybacks compete for capital.'),
    citedClaim('competition', 'Thesis-Changing Questions', 'AGCO and other competitors can substitute precision equipment and dealer service.'),
    citedClaim('valuation', 'Implied Expectations', 'At a $628.16 share price, a 10% return requires cash flow growth above 8% under this sensitivity.', ['filing', 'market']),
    citedClaim('falsifier', 'What Would Change the Thesis', 'Dealer share erosion below the stated threshold would change the thesis.'),
    citedClaim('clock', 'Next Evidence and Maintenance Test', 'The next 10-Q should test pricing, inventory, and cash conversion.'),
    citedClaim('pvm', 'System and Unit Economics', 'Reported price realization offset a 12% production-volume decline.'),
    citedClaim('aftermarket', 'Product and Technical Moat', 'The installed equipment base supports recurring parts, service, and dealer demand.'),
    citedClaim('working-capital', 'System and Unit Economics', 'Inventory and receivables increased the working-capital cash conversion cycle.')
  ],
  now
});
assert.strictEqual(compiledDeere.businessModel.primary, 'industrial');
assert.strictEqual(compiledDeere.researchPlan.status, 'decision_ready');
assert.deepStrictEqual(compiledDeere.researchPlan.missingModuleIds, []);
assert.strictEqual(compiledDeere.researchPlan.insights[0].text.includes('$628.16'), true);
assert.deepStrictEqual(
  compiledDeere.researchPlan.modules.find(row => row.id === 'reverse_expectations').calculationIds,
  ['valuation']
);

console.log('investmentDossierProfileService tests passed');
