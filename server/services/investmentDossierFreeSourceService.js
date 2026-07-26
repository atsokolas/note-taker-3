const crypto = require('crypto');
const { padCik } = require('./edgarWatcherService');

const COMPANY_FACTS_METRICS = Object.freeze([
  {
    id: 'revenue',
    label: 'Revenue',
    tags: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet'
    ]
  },
  {
    id: 'gross_profit',
    label: 'Gross profit',
    tags: ['GrossProfit']
  },
  {
    id: 'operating_income',
    label: 'Operating income',
    tags: ['OperatingIncomeLoss']
  },
  {
    id: 'operating_cash_flow',
    label: 'Operating cash flow',
    tags: ['NetCashProvidedByUsedInOperatingActivities']
  },
  {
    id: 'capital_expenditures',
    label: 'Capital expenditures',
    tags: ['PaymentsToAcquirePropertyPlantAndEquipment']
  },
  {
    id: 'inventory',
    label: 'Inventory',
    tags: ['InventoryNet']
  }
]);

const clean = (value = '', limit = 1000) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const companyFactsUrl = cik => (
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`
);

const annualPointsForFact = ({ fact = {}, tag = '', years = 5 } = {}) => {
  const usd = Array.isArray(fact?.units?.USD) ? fact.units.USD : [];
  const latestByPeriodEnd = new Map();
  usd
    .filter(row => (
      row?.form === '10-K'
      && row?.fp === 'FY'
      && Number.isFinite(Number(row?.val))
      && /^\d{4}-\d{2}-\d{2}$/.test(String(row?.end || ''))
      && row?.accn
      && (!row?.start || (
        (Date.parse(row.end) - Date.parse(row.start)) / 86400000 >= 300
        && (Date.parse(row.end) - Date.parse(row.start)) / 86400000 <= 430
      ))
    ))
    .sort((a, b) => (
      String(b.filed || '').localeCompare(String(a.filed || ''))
      || String(b.accn || '').localeCompare(String(a.accn || ''))
    ))
    .forEach((row) => {
      const periodEnd = String(row.end);
      if (latestByPeriodEnd.has(periodEnd)) return;
      latestByPeriodEnd.set(periodEnd, {
        fiscalYear: Number(periodEnd.slice(0, 4)),
        end: periodEnd,
        value: Number(row.val),
        unit: 'USD',
        accessionNumber: String(row.accn),
        filed: String(row.filed || ''),
        form: '10-K',
        tag
      });
    });
  return Array.from(latestByPeriodEnd.values())
    .sort((a, b) => String(b.end).localeCompare(String(a.end)))
    .slice(0, Math.max(1, Number(years) || 5))
    .sort((a, b) => String(a.end).localeCompare(String(b.end)));
};

const metricSeriesFromCompanyFacts = ({ companyFacts = {}, years = 5 } = {}) => {
  const gaap = companyFacts?.facts?.['us-gaap'] || {};
  const metrics = COMPANY_FACTS_METRICS.map((definition) => {
    const selectedTag = definition.tags.find((tag) => {
      const points = annualPointsForFact({ fact: gaap[tag], tag, years });
      return points.length >= 3;
    });
    if (!selectedTag) return null;
    const fact = gaap[selectedTag] || {};
    return {
      id: definition.id,
      label: clean(fact.label || definition.label, 120),
      description: clean(fact.description || '', 360),
      namespace: 'us-gaap',
      tag: selectedTag,
      unit: 'USD',
      points: annualPointsForFact({ fact, tag: selectedTag, years })
    };
  }).filter(Boolean);
  const latestFiscalYear = Math.max(
    ...metrics.flatMap(metric => metric.points.map(point => point.fiscalYear))
  );
  return metrics.filter(metric => metric.points.at(-1)?.fiscalYear >= latestFiscalYear - 1);
};

const formatUsd = (value) => {
  const absolute = Math.abs(Number(value));
  const sign = Number(value) < 0 ? '-' : '';
  if (absolute >= 1e12) return `${sign}$${(absolute / 1e12).toFixed(2)}tn`;
  if (absolute >= 1e9) return `${sign}$${(absolute / 1e9).toFixed(2)}bn`;
  if (absolute >= 1e6) return `${sign}$${(absolute / 1e6).toFixed(2)}mn`;
  return `${sign}$${Math.round(absolute).toLocaleString('en-US')}`;
};

const buildCompanyFactsOperatingBenchmark = ({
  companyFacts = {},
  cik = '',
  ticker = '',
  companyName = '',
  now = new Date()
} = {}) => {
  const normalizedCik = padCik(cik || companyFacts?.cik);
  const url = companyFactsUrl(normalizedCik);
  const metrics = metricSeriesFromCompanyFacts({ companyFacts });
  if (metrics.length < 2) {
    return {
      sourceRef: null,
      stop: {
        code: 'OPERATING_BENCHMARK_UNAVAILABLE',
        evidenceArchetype: 'operating_benchmark',
        message: 'SEC Company Facts did not contain at least two comparable annual operating series with three years of history.'
      }
    };
  }
  const entityName = clean(companyName || companyFacts?.entityName || ticker || 'Company', 240);
  const snippet = [
    `${entityName} SEC Company Facts operating history.`,
    ...metrics.map(metric => (
      `${metric.label}: ${metric.points.map(point => (
        `FY${point.fiscalYear} ${formatUsd(point.value)}`
      )).join('; ')}.`
    )),
    'Values are issuer-filed US-GAAP facts; periods and accessions are preserved in source metadata.'
  ].join('\n');
  const contentHash = crypto.createHash('sha256').update(snippet).digest('hex');
  const retrievedAt = new Date(now).toISOString();
  return {
    sourceRef: {
      type: 'external',
      title: `${clean(ticker, 20) || entityName} SEC Company Facts operating history`,
      snippet,
      url,
      citationLabel: `SEC Company Facts · retrieved ${retrievedAt.slice(0, 10)}`,
      provider: 'sec-companyfacts',
      metadata: {
        evidenceArchetype: 'operating_benchmark',
        sourceClass: 'operating_benchmark',
        acquisitionMethod: 'sec_companyfacts',
        cik: normalizedCik,
        ticker: clean(ticker, 20).toUpperCase(),
        metrics,
        provenance: {
          discoveredFrom: `SEC Company Facts for issuer CIK ${normalizedCik}`,
          retrievedAt,
          contentHash,
          httpStatus: 200,
          licenseOrAccess: 'public'
        },
        validation: {
          status: 'accepted',
          reasons: []
        }
      },
      addedBy: 'ai'
    },
    stop: null
  };
};

module.exports = {
  COMPANY_FACTS_METRICS,
  annualPointsForFact,
  buildCompanyFactsOperatingBenchmark,
  companyFactsUrl,
  metricSeriesFromCompanyFacts
};
