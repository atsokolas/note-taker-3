const assert = require('node:assert/strict');
const {
  buildInvestmentMaintenanceComparison,
  compareExpectations,
  sectionImpact
} = require('./investmentDossierComparisonService');

assert.match(sectionImpact('Product and Technical Moat'), /competitive advantage/);
assert.match(sectionImpact('Economics and capital allocation'), /cash generation/);

const explanation = buildInvestmentMaintenanceComparison({
  sourceLabel: 'FAST Q2 2026 10-Q',
  before: {
    judgment: { currentJudgment: 'The moat is durable.' },
    investmentDossier: {
      valuation: {
        status: 'complete',
        price: 40,
        enterpriseValue: 20000,
        unitScale: 'millions',
        operatingBase: { value: 1000 },
        scenarios: [{ terminalMultiple: 20, requiredCagr: 0.08 }]
      }
    }
  },
  after: {
    judgment: { currentJudgment: 'The moat is durable.' },
    investmentDossier: {
      valuation: {
        status: 'complete',
        price: 45,
        enterpriseValue: 22500,
        unitScale: 'millions',
        operatingBase: { value: 1000 },
        scenarios: [{ terminalMultiple: 20, requiredCagr: 0.105 }]
      }
    }
  },
  claimComparison: {
    counts: { changed: 1, preserved: 7 },
    deltas: {
      changed: [{
        before: { text: 'Onsite penetration is flat.', section: 'Product and Technical Moat' },
        after: { text: 'Onsite penetration accelerated.', section: 'Product and Technical Moat' }
      }]
    }
  }
});

assert.match(explanation.headline, /changed 1 decision-relevant claim/);
assert.match(explanation.claimChanges[0].detail, /changed from/);
assert.match(explanation.claimChanges[0].whyItMatters, /competitive advantage/);
assert.equal(explanation.expectations.status, 'changed');
assert.equal(explanation.judgmentChanged, false);

const unchanged = compareExpectations(
  { status: 'complete', price: 45, enterpriseValue: 22500, unitScale: 'millions', operatingBase: { value: 1000 }, scenarios: [] },
  { status: 'complete', price: 45, enterpriseValue: 22500, unitScale: 'millions', operatingBase: { value: 1000 }, scenarios: [] }
);
assert.equal(unchanged.status, 'unchanged');

console.log('investmentDossierComparisonService tests passed');
