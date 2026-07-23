const assert = require('assert');
const {
  buildReverseExpectations,
  compoundAnnualGrowthRate,
  round
} = require('./investmentValuationService');

const model = buildReverseExpectations({
  price: 208.76,
  dilutedShares: 24.2,
  operatingBase: 96.676,
  annualReturn: 0.10,
  horizonYears: 5,
  terminalMultiples: [40, 25, 30, 35, 30]
});

assert.strictEqual(round(model.equityValue, 1), 5052.0);
assert.strictEqual(round(model.currentOperatingMultiple, 1), 52.3);
assert.strictEqual(round(model.currentOperatingYield * 100, 2), 1.91);
assert.strictEqual(round(model.requiredEndingEquityValue, 1), 8136.3);
assert.deepStrictEqual(model.scenarios.map(row => row.terminalMultiple), [25, 30, 35, 40]);
assert.deepStrictEqual(
  model.scenarios.map(row => round(row.requiredOperatingValue, 1)),
  [325.5, 271.2, 232.5, 203.4]
);
assert.deepStrictEqual(
  model.scenarios.map(row => round(row.requiredOperatingCagr * 100, 1)),
  [27.5, 22.9, 19.2, 16.0]
);
assert.strictEqual(round(compoundAnnualGrowthRate({
  beginningValue: 194.348,
  endingValue: model.scenarios[1].requiredOperatingValue,
  years: 5
}) * 100, 1), 6.9);

assert.throws(() => buildReverseExpectations({
  price: 0,
  dilutedShares: 1,
  operatingBase: 1,
  annualReturn: 0.1,
  horizonYears: 5,
  terminalMultiples: [20]
}), /price must be a positive finite number/);

assert.throws(() => buildReverseExpectations({
  price: 1,
  dilutedShares: 1,
  operatingBase: 1,
  annualReturn: 0.1,
  horizonYears: 5,
  terminalMultiples: []
}), /At least one terminal multiple/);

console.log('investmentValuationService tests passed');
