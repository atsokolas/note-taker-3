const finitePositive = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return number;
};

const finiteNumber = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return number;
};

const clean = (value = '', max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const normalizeDate = (value, label) => {
  const raw = clean(value, 40);
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid date.`);
  return parsed;
};

const normalizeSourceRefIds = (value = []) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map(entry => clean(entry, 80))
    .filter(Boolean)
));

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
  terminalMultiples = [],
  netCashOrDebt = 0
} = {}) => {
  const sharePrice = finitePositive(price, 'price');
  const shares = finitePositive(dilutedShares, 'dilutedShares');
  const base = finitePositive(operatingBase, 'operatingBase');
  const balanceSheetAdjustment = finiteNumber(netCashOrDebt, 'netCashOrDebt');
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
  const enterpriseValue = equityValue + balanceSheetAdjustment;
  if (enterpriseValue <= 0) throw new Error('enterpriseValue must be positive after the net cash or debt adjustment.');
  const requiredEndingEquityValue = equityValue * ((1 + hurdle) ** horizon);
  const requiredEndingEnterpriseValue = requiredEndingEquityValue + balanceSheetAdjustment;
  if (requiredEndingEnterpriseValue <= 0) {
    throw new Error('requiredEndingEnterpriseValue must be positive after the net cash or debt adjustment.');
  }
  const scenarios = multiples.map((terminalMultiple) => {
    const requiredOperatingValue = requiredEndingEnterpriseValue / terminalMultiple;
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
    netCashOrDebt: balanceSheetAdjustment,
    enterpriseValue,
    operatingBase: base,
    currentOperatingMultiple: enterpriseValue / base,
    currentOperatingYield: base / enterpriseValue,
    annualReturn: hurdle,
    horizonYears: horizon,
    requiredEndingEquityValue,
    requiredEndingEnterpriseValue,
    scenarios
  };
};

const buildValuationSnapshot = ({
  asOf,
  currency = 'USD',
  unitScale = 'millions',
  price,
  dilutedShares,
  netCashOrDebt = 0,
  operatingBase = {},
  annualReturn,
  horizonYears,
  terminalMultiples = [],
  sourceRefIds = [],
  calculatedAt = new Date()
} = {}) => {
  const priceDate = normalizeDate(asOf, 'asOf');
  const calculatedDate = normalizeDate(calculatedAt, 'calculatedAt');
  if (priceDate.getTime() > calculatedDate.getTime() + (24 * 60 * 60 * 1000)) {
    throw new Error('asOf cannot be in the future.');
  }
  const normalizedCurrency = clean(currency, 8).toUpperCase();
  if (normalizedCurrency !== 'USD') throw new Error('currency must be USD.');
  const normalizedUnitScale = clean(unitScale, 20).toLowerCase();
  if (!['millions', 'billions'].includes(normalizedUnitScale)) {
    throw new Error('unitScale must be millions or billions.');
  }
  const metric = clean(operatingBase.metric, 80).toLowerCase();
  const period = clean(operatingBase.period, 80);
  const derivation = clean(operatingBase.derivation, 1200);
  if (!metric) throw new Error('operatingBase.metric is required.');
  if (!period) throw new Error('operatingBase.period is required.');
  if (derivation.length < 12) throw new Error('operatingBase.derivation must explain the reported or normalized base.');

  const baseSourceRefIds = normalizeSourceRefIds(operatingBase.sourceRefIds);
  const allSourceRefIds = normalizeSourceRefIds([...sourceRefIds, ...baseSourceRefIds]);
  if (baseSourceRefIds.length === 0) {
    throw new Error('operatingBase.sourceRefIds must include at least one source.');
  }
  if (allSourceRefIds.length < 2) {
    throw new Error('sourceRefIds must include separate market and operating evidence.');
  }

  const model = buildReverseExpectations({
    price,
    dilutedShares,
    netCashOrDebt,
    operatingBase: operatingBase.value,
    annualReturn,
    horizonYears,
    terminalMultiples
  });

  return {
    status: 'complete',
    asOf: priceDate,
    currency: normalizedCurrency,
    unitScale: normalizedUnitScale,
    price: model.price,
    dilutedShares: model.dilutedShares,
    equityValue: model.equityValue,
    netCashOrDebt: model.netCashOrDebt,
    enterpriseValue: model.enterpriseValue,
    currentOperatingMultiple: model.currentOperatingMultiple,
    currentOperatingYield: model.currentOperatingYield,
    requiredEndingEquityValue: model.requiredEndingEquityValue,
    requiredEndingEnterpriseValue: model.requiredEndingEnterpriseValue,
    operatingBase: {
      metric,
      period,
      value: model.operatingBase,
      derivation,
      sourceRefIds: baseSourceRefIds
    },
    hurdle: {
      annualReturn: model.annualReturn,
      horizonYears: model.horizonYears,
      terminalMultiples: model.scenarios.map(row => row.terminalMultiple)
    },
    scenarios: model.scenarios.map(row => ({
      terminalMultiple: row.terminalMultiple,
      requiredOperatingValue: row.requiredOperatingValue,
      requiredCagr: row.requiredOperatingCagr
    })),
    sensitivityBoundaries: [],
    sourceRefIds: allSourceRefIds,
    calculatedAt: calculatedDate
  };
};

module.exports = {
  buildValuationSnapshot,
  buildReverseExpectations,
  compoundAnnualGrowthRate,
  round
};
