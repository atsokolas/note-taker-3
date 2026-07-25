const assert = require('assert');
const { completeResearchPlan, upgradeInvestmentDossierProfile } = require('./investmentDossierProfileService');
const { evaluateInvestmentDossierQuality } = require('./investmentDossierQualityService');

const headings = [
  'Current Judgment',
  'Implied Expectations',
  'Thesis-Changing Questions',
  'Product and Technical Moat',
  'System and Unit Economics',
  'Operating Engine and Capital Allocation',
  'Obligations, Concentration, and Policy',
  'What Would Change the Thesis',
  'Next Evidence and Maintenance Test'
];
const body = {
  type: 'doc',
  content: headings.map(text => ({
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text }]
  }))
};
const sourceRefs = [
  { _id: 'filing', title: 'Costco 2025 10-K', provider: 'sec-edgar', metadata: { evidenceArchetype: 'filing' } },
  { _id: 'product', title: 'Costco membership terms', metadata: { evidenceArchetype: 'company_product' } },
  { _id: 'competitor', title: 'Walmart annual report', metadata: { evidenceArchetype: 'competitor_primary' } },
  { _id: 'independent', title: 'Retail industry benchmark', metadata: { evidenceArchetype: 'independent_domain' } },
  { _id: 'market', title: 'Costco market snapshot', metadata: { evidenceArchetype: 'market_snapshot' } },
  { _id: 'customer', title: 'Costco renewal economics', metadata: { evidenceArchetype: 'customer_economics' } },
  { _id: 'operating', title: 'Warehouse operating benchmark', metadata: { evidenceArchetype: 'operating_benchmark' } }
];
const base = upgradeInvestmentDossierProfile({
  profile: { company: { name: 'Costco Wholesale Corporation', ticker: 'COST' } },
  explicitBusinessModel: 'membership_retail',
  now: new Date('2026-07-24T12:00:00.000Z')
});
const profile = completeResearchPlan({
  profile: base,
  businessModel: 'membership_retail',
  evidenceArchetypes: sourceRefs.map(source => source.metadata.evidenceArchetype),
  modules: base.researchPlan.requiredModuleIds.map(id => ({
    id,
    status: 'complete',
    claimIds: [`claim-${id}`],
    calculationIds: ['reverse_expectations', 'unit_economics_cash_conversion'].includes(id)
      ? [`calculation-${id}`]
      : [],
    sourceRefIds: ['filing']
  })),
  insights: [{
    id: 'costco-non-obvious',
    text: 'Membership fee growth can be bridged into merchandise price investment and incremental operating profit.',
    reproducible: true,
    sourceRefIds: ['filing', 'product']
  }]
});
const claims = Array.from({ length: 24 }, (_, index) => ({
  claimId: `claim-${index}`,
  support: index % 3 === 0 ? 'partial' : 'supported',
  sourceRefIds: ['filing'],
  citationIds: [`citation-${index}`]
}));

const passing = evaluateInvestmentDossierQuality({
  page: { investmentDossier: profile },
  body,
  claims,
  sourceRefs,
  words: 2600
});
assert.strictEqual(passing.ok, true, passing.failures.join('\n'));
assert.strictEqual(passing.status, 'decision_ready');

const thinProfile = upgradeInvestmentDossierProfile({
  profile: { company: { name: 'Generic Company', ticker: 'GEN' } },
  candidates: [{ title: 'Generic 10-K', provider: 'sec-edgar', text: 'Generic filing.' }]
});
const failing = evaluateInvestmentDossierQuality({
  page: { investmentDossier: thinProfile },
  body,
  claims: claims.slice(0, 10).map((claim, index) => ({
    ...claim,
    support: index === 0 ? 'unsupported' : claim.support
  })),
  sourceRefs: sourceRefs.slice(0, 1),
  words: 1200
});
assert.strictEqual(failing.ok, false);
assert.match(failing.failures.join(' '), /unclassified/i);
assert.match(failing.failures.join(' '), /too thin/i);
assert.match(failing.failures.join(' '), /research modules remain incomplete/i);
assert.match(failing.failures.join(' '), /evidence archetypes/i);
assert.match(failing.failures.join(' '), /unsupported decision claims/i);

console.log('investmentDossierQualityService tests passed');
