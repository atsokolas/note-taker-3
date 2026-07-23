const finitePositive = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return number;
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const compoundAnnualGrowthRate = ({ beginningValue, endingValue, years }) => {
  const beginning = finitePositive(beginningValue, 'beginningValue');
  const ending = finitePositive(endingValue, 'endingValue');
  const period = finitePositive(years, 'years');
  return (ending / beginning) ** (1 / period) - 1;
};

const buildReverseExpectations = ({
  price,
  dilutedShares,
  operatingBase,
  annualReturn,
  horizonYears,
  terminalMultiples = []
} = {}) => {
  const sharePrice = finitePositive(price, 'price');
  const shares = finitePositive(dilutedShares, 'dilutedShares');
  const base = finitePositive(operatingBase, 'operatingBase');
  const horizon = finitePositive(horizonYears, 'horizonYears');
  const hurdle = Number(annualReturn);
  if (!Number.isFinite(hurdle) || hurdle <= -1) {
    throw new Error('annualReturn must be finite and greater than -1.');
  }
  const multiples = Array.from(new Set(
    (Array.isArray(terminalMultiples) ? terminalMultiples : [])
      .map(value => finitePositive(value, 'terminalMultiple'))
  )).sort((a, b) => a - b);
  if (!multiples.length) throw new Error('At least one terminal multiple is required.');

  const equityValue = sharePrice * shares;
  const requiredEndingEquityValue = equityValue * ((1 + hurdle) ** horizon);
  const scenarios = multiples.map((terminalMultiple) => {
    const requiredOperatingValue = requiredEndingEquityValue / terminalMultiple;
    return {
      terminalMultiple,
      requiredOperatingValue,
      requiredOperatingCagr: compoundAnnualGrowthRate({
        beginningValue: base,
        endingValue: requiredOperatingValue,
        years: horizon
      })
    };
  });

  return {
    price: sharePrice,
    dilutedShares: shares,
    equityValue,
    operatingBase: base,
    currentOperatingMultiple: equityValue / base,
    currentOperatingYield: base / equityValue,
    annualReturn: hurdle,
    horizonYears: horizon,
    requiredEndingEquityValue,
    scenarios
  };
};

module.exports = {
  buildReverseExpectations,
  compoundAnnualGrowthRate,
  round
};
