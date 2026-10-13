const assert = require('assert');
const { completeResearchPlan, upgradeInvestmentDossierProfile } = require('./investmentDossierProfileService');
const { evaluateInvestmentDossierQuality } = require('./investmentDossierQualityService');
const { MARKET_PLACEHOLDER } = require('./companyDossierService');

const headings = [
  'Current Judgment',
  'Implied Expectations',
  'Thesis-Changing Questions',
  'Product and Technical Moat',
  'System and Unit Economics',
  'Operating Engine and Capital Allocation',
  'Obligations, Concentration, and Policy',
  'What Would Change the Thesis',
  'What to Check Next'
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

const citedQuestions = evaluateInvestmentDossierQuality({
  page: { investmentDossier: profile },
  body,
  claims: [
    ...claims.slice(0, 22),
    {
      claimId: 'question',
      section: 'Thesis-Changing Questions',
      text: 'Would renewal resilience persist through a downturn?',
      support: 'unsupported',
      sourceRefIds: ['filing'],
      citationIds: ['question-citation']
    },
    {
      claimId: 'falsifier',
      section: 'What Would Change the Thesis',
      text: 'A sustained renewal decline would invalidate the thesis.',
      support: 'unsupported',
      sourceRefIds: ['filing'],
      citationIds: ['falsifier-citation']
    }
  ],
  sourceRefs,
  words: 2600
});
assert.strictEqual(citedQuestions.ok, true, citedQuestions.failures.join('\n'));
assert.strictEqual(citedQuestions.metrics.unresolvedDecisionQuestions, 2);

const inventedNumber = evaluateInvestmentDossierQuality({
  page: { investmentDossier: profile },
  body,
  claims: claims.map((claim, index) => (
    index === 0
      ? {
          ...claim,
          section: 'Implied Expectations',
          text: 'The company has $999 billion of unsupported recurring revenue.'
        }
      : claim
  )),
  sourceRefs,
  words: 2600
});
assert.strictEqual(inventedNumber.ok, false);
assert.match(inventedNumber.failures.join(' '), /numeric claims not grounded/i);

// The owner's own hurdle and a plain note of what could not be found have
// nothing to cite and are not refused; a hurdle the owner did not set is.
const framing = (text) => evaluateInvestmentDossierQuality({
  page: { investmentDossier: { ...profile, hurdle: { annualReturn: 0.1, horizonYears: 5 } } },
  body,
  claims: [...claims, { claimId: 'framing', section: 'Current Judgment', text, support: 'unsupported' }],
  sourceRefs,
  words: 2600
});
assert.strictEqual(framing('Owner hurdle: 10.0% annual return over 5 years. This is a starting judgment.').ok, true);
assert.strictEqual(framing('An independent benchmark of warehouse density could not be found.').ok, true);
assert.strictEqual(framing('Security attractiveness cannot be assessed: no filing pairs a dated price with a diluted share count.').ok, true);
assert.strictEqual(framing('Any such multiple would need share-count inputs not present in the source set.').ok, true);
assert.strictEqual(framing('Owner hurdle: 15.0% annual return over 5 years.').ok, false);
assert.strictEqual(framing('What would have to be true for a 10% annual return over five years is not computable from the attached evidence.').ok, true);
assert.strictEqual(framing('Whether the quoted price prices in too much growth cannot be answered from these filings alone.').ok, true);
assert.strictEqual(framing('What is missing: a diluted share count as of the October 2026 price date. None of these could be found in the attached filings.').ok, true);
assert.strictEqual(framing('Evidence here is insufficient to affirm or reject the 10% hurdle; the inputs needed to compute a multiple are missing.').ok, true);
assert.strictEqual(framing("The owner's working thesis is that supply grows faster than customers. The hurdle is a 10.0% annual return over five years; this is a starting assumption.").ok, true);
assert.strictEqual(framing('Until a price and share count from the same date are matched, the implied growth cannot be backed out. This is the largest evidence gap.').ok, true);
assert.strictEqual(framing('Net sales grew 5%, 8% and 10%, but whether the price assumes that cannot be tested without a share count.').ok, false);

// A figure shown anywhere on the page may be restated elsewhere: in a note of
// what could not be found, or in a question ahead of the paragraph that adds it up.
const filed = [{ ...sourceRefs[0], snippet: 'Comparable sales grew 7% and 8%. Three customers were 16%, 15% and 13% of revenue.' }, ...sourceRefs.slice(1)];
const restated = (...texts) => evaluateInvestmentDossierQuality({
  page: { investmentDossier: profile },
  body,
  claims: [...claims, ...texts.map((text, index) => ({ claimId: `restated-${index}`, section: 'Current Judgment', text, support: 'supported', sourceRefIds: ['filing'], citationIds: [`r-${index}`] }))],
  sourceRefs: filed,
  words: 2600
});
assert.strictEqual(restated(
  'Does concentration near 44% of revenue reflect diversified demand?',
  'Three customers were 16%, 15% and 13% of revenue, together 44%.'
).ok, true);
assert.strictEqual(restated('Does concentration near 47% of revenue reflect diversified demand?').ok, false);
assert.strictEqual(framing('Whether 7%-8% comparable growth lasts could not be found in any independent source.').ok, false);
assert.strictEqual(evaluateInvestmentDossierQuality({
  page: { investmentDossier: { ...profile, hurdle: { annualReturn: 0.1, horizonYears: 5 } } },
  body,
  claims: [...claims, { claimId: 'gap', section: 'Implied Expectations', text: 'Whether 7%-8% comparable growth lasts could not be found in any independent source.', support: 'unsupported' }],
  sourceRefs: filed,
  words: 2600
}).ok, true);

// A page that still says it has not been written is refused.
const template = evaluateInvestmentDossierQuality({
  page: { investmentDossier: profile },
  body: { ...body, content: [...body.content, { type: 'paragraph', content: [{ type: 'text', text: MARKET_PLACEHOLDER }] }] },
  claims,
  sourceRefs,
  words: 2600
});
assert.match(template.failures.join(' '), /unwritten template/);

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
assert.match(failing.failures.join(' '), /unsupported decision claims/i);
// What the dossier lacks is a note for the repair pass and the owner, never a refusal.
assert.match(failing.hints.join(' '), /unclassified/i);
assert.match(failing.hints.join(' '), /too thin/i);
assert.match(failing.hints.join(' '), /research modules remain incomplete/i);
assert.match(failing.hints.join(' '), /evidence archetypes/i);
assert.doesNotMatch(failing.failures.join(' '), /unclassified|too thin|modules|archetypes/i);

console.log('investmentDossierQualityService tests passed');
