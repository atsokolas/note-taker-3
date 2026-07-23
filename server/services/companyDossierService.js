const clean = (value = '', max = 2400) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const heading = (text) => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }]
});

const paragraph = (text = '') => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {})
});

const normalizeCompanyDossierInput = (input = {}) => {
  const ticker = clean(input.ticker, 12).toUpperCase();
  const startingJudgment = clean(input.startingJudgment);
  const requiredReturn = Number(input.requiredReturn);
  const horizonYears = Number(input.horizonYears);
  if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) throw new Error('Enter a valid public-company ticker.');
  if (startingJudgment.length < 20) throw new Error('Starting judgment must be at least 20 characters.');
  if (!Number.isFinite(requiredReturn) || requiredReturn <= 0 || requiredReturn > 1) {
    throw new Error('Required return must be greater than 0% and no more than 100%.');
  }
  if (!Number.isInteger(horizonYears) || horizonYears < 1 || horizonYears > 20) {
    throw new Error('Horizon must be a whole number from 1 to 20 years.');
  }
  return { ticker, startingJudgment, requiredReturn, horizonYears };
};

const buildCompanyDossierBody = ({ companyName, ticker, startingJudgment, requiredReturn, horizonYears }) => ({
  type: 'doc',
  content: [
    heading('Current judgment'),
    paragraph(startingJudgment),
    paragraph(`Owner hurdle: ${(requiredReturn * 100).toFixed(1)}% annual return over ${horizonYears} years. This is a starting judgment, not a proven conclusion.`),
    heading('What the market is pricing'),
    paragraph('Awaiting a dated price, diluted share count, and normalized operating base. Noeis will not infer these inputs silently.'),
    heading('Business and product system'),
    paragraph(),
    heading('Technical architecture and moat'),
    paragraph(),
    heading('Economics and capital allocation'),
    paragraph(),
    heading('Competitive map'),
    paragraph(),
    heading('Risks, falsifiers, and open questions'),
    paragraph(),
    heading('What changed'),
    paragraph(`SEC filing watch armed for ${companyName || ticker}. Material changes remain candidates until the owner accepts a trusted head.`),
    heading('Sources and maintenance state'),
    paragraph('Free primary sources only. SEC filings will enter the evidence queue; paid transcript and market-data providers are not required.')
  ]
});

const buildInvestmentDossierProfile = ({ companyName, cik, ticker, startingJudgment, requiredReturn, horizonYears, now = new Date() }) => ({
  version: 1,
  company: { name: clean(companyName, 240), ticker, cik: clean(cik, 20) },
  startingJudgment,
  hurdle: { annualReturn: requiredReturn, horizonYears },
  valuation: {
    status: 'awaiting_inputs',
    price: null,
    priceAsOf: null,
    dilutedShares: null,
    equityValue: null,
    operatingMetric: 'normalized_free_cash_flow',
    operatingBase: null,
    terminalMultiples: [20, 25, 30, 35, 40],
    scenarios: [],
    sourceRefs: []
  },
  clocks: {
    filingAcceptedAt: null,
    priceRefreshedAt: null
  },
  createdAt: now
});

module.exports = {
  buildCompanyDossierBody,
  buildInvestmentDossierProfile,
  normalizeCompanyDossierInput
};
