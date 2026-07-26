const assert = require('node:assert/strict');
const {
  annualPointsForFact,
  buildCompanyFactsOperatingBenchmark,
  metricSeriesFromCompanyFacts
} = require('./investmentDossierFreeSourceService');

const rows = (values, tag = 'tag') => values.flatMap(({ fy, val }) => ([
  {
    fy: fy + 1,
    fp: 'FY',
    form: '10-K',
    end: `${fy}-12-31`,
    filed: `${fy + 1}-02-20`,
    accn: `${tag}-${fy}-original`,
    val
  },
  {
    fy,
    fp: 'FY',
    form: '10-K',
    end: `${fy}-12-31`,
    filed: `${fy + 2}-02-20`,
    accn: `${tag}-${fy}-comparative`,
    val
  }
]));

const fact = (label, values, tag) => ({
  label,
  description: `${label} description`,
  units: { USD: rows(values, tag) }
});

const run = () => {
  const revenue = fact('Revenue', [
    { fy: 2021, val: 1000000000 },
    { fy: 2022, val: 1200000000 },
    { fy: 2023, val: 1500000000 },
    { fy: 2024, val: 1700000000 },
    { fy: 2025, val: 1900000000 }
  ], 'revenue');
  const points = annualPointsForFact({
    fact: revenue,
    tag: 'RevenueFromContractWithCustomerExcludingAssessedTax'
  });
  assert.equal(points.length, 5);
  assert.equal(points[0].fiscalYear, 2021);
  assert.equal(points.at(-1).accessionNumber, 'revenue-2025-comparative');

  const companyFacts = {
    cik: 123456,
    entityName: 'Example Industrial Corp.',
    facts: {
      'us-gaap': {
        RevenueFromContractWithCustomerExcludingAssessedTax: revenue,
        OperatingIncomeLoss: fact('Operating income', [
          { fy: 2021, val: 100000000 },
          { fy: 2022, val: 130000000 },
          { fy: 2023, val: 140000000 },
          { fy: 2024, val: 160000000 },
          { fy: 2025, val: 180000000 }
        ], 'operating-income'),
        GrossProfit: fact('Gross profit', [
          { fy: 2016, val: 50000000 },
          { fy: 2017, val: 60000000 },
          { fy: 2018, val: 70000000 }
        ], 'gross-profit'),
        InventoryNet: fact('Inventory', [
          { fy: 2023, val: 200000000 },
          { fy: 2024, val: 230000000 },
          { fy: 2025, val: 250000000 }
        ], 'inventory')
      }
    }
  };
  const series = metricSeriesFromCompanyFacts({ companyFacts });
  assert.deepEqual(series.map(metric => metric.id), ['revenue', 'operating_income', 'inventory']);

  const built = buildCompanyFactsOperatingBenchmark({
    companyFacts,
    cik: '0000123456',
    ticker: 'EXM',
    now: new Date('2026-07-26T19:00:00.000Z')
  });
  assert.equal(built.stop, null);
  assert.equal(built.sourceRef.provider, 'sec-companyfacts');
  assert.equal(built.sourceRef.metadata.evidenceArchetype, 'operating_benchmark');
  assert.equal(built.sourceRef.metadata.acquisitionMethod, 'sec_companyfacts');
  assert.equal(built.sourceRef.metadata.metrics.length, 3);
  assert.match(built.sourceRef.snippet, /FY2025 \$1\.90bn/);
  assert.match(built.sourceRef.url, /CIK0000123456\.json$/);
  assert.match(built.sourceRef.metadata.provenance.contentHash, /^[a-f0-9]{64}$/);

  const unavailable = buildCompanyFactsOperatingBenchmark({
    companyFacts: {
      cik: 123456,
      facts: { 'us-gaap': { Revenues: revenue } }
    },
    cik: '123456'
  });
  assert.equal(unavailable.sourceRef, null);
  assert.equal(unavailable.stop.code, 'OPERATING_BENCHMARK_UNAVAILABLE');
};

if (require.main === module) {
  try {
    run();
    console.log('investment dossier free source service tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
