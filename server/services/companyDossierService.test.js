const assert = require('assert');
const {
  buildCompanyDossierBody,
  buildInvestmentDossierProfile,
  normalizeCompanyDossierInput
} = require('./companyDossierService');

const input = normalizeCompanyDossierInput({
  ticker: ' nvda ',
  startingJudgment: 'NVIDIA can retain unusual pricing power if its full-stack advantage persists.',
  requiredReturn: 0.1,
  horizonYears: 5
});
assert.strictEqual(input.ticker, 'NVDA');
assert.strictEqual(input.requiredReturn, 0.1);
assert.throws(() => normalizeCompanyDossierInput({ ...input, startingJudgment: 'Too short' }), /20 characters/);

const profile = buildInvestmentDossierProfile({
  ...input,
  companyName: 'NVIDIA CORP',
  cik: '1045810',
  now: new Date('2026-07-23T00:00:00.000Z')
});
assert.strictEqual(profile.valuation.status, 'awaiting_inputs');
assert.strictEqual(profile.clocks.filingAcceptedAt, null);
assert.strictEqual(profile.startingJudgment, input.startingJudgment);

const body = buildCompanyDossierBody({ ...input, companyName: 'NVIDIA CORP' });
const text = JSON.stringify(body);
assert.match(text, /Current judgment/);
assert.match(text, /starting judgment, not a proven conclusion/i);
assert.match(text, /Free primary sources only/);

console.log('companyDossierService tests passed');
