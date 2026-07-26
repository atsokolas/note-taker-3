const assert = require('node:assert/strict');
const {
  acquireCompetitorPrimarySource,
  extractCompetitorPrimaryExcerpt,
  extractExplicitCompetitorMentions,
  resolveCompetitorRegistryMatch
} = require('./investmentDossierCompetitorSourceService');

const issuerText = `
Competition
The equipment operations sell products and services in competitive global markets.
The competitive environment for the agriculture and turf operations includes some global competitors, such as AGCO Corporation, CLAAS KGaA mbH, CNH Industrial N.V., Kubota Tractor Corporation, and The Toro Company.
Global competitors of the construction and forestry segment include Caterpillar Inc., CNH Industrial N.V., and Doosan Infracore Co., Ltd.
`;

const annualSubmissions = ({
  accessionNumber = '0000880266-26-000010',
  form = '10-K',
  primaryDocument = 'agco-20251231.htm'
} = {}) => ({
  filings: {
    recent: {
      accessionNumber: [accessionNumber],
      filingDate: ['2026-02-20'],
      reportDate: ['2025-12-31'],
      form: [form],
      primaryDocument: [primaryDocument]
    }
  }
});

const competitorText = [
  'Item 1. Business',
  'AGCO designs, manufactures, and distributes agricultural equipment and precision agriculture technology.',
  'Products include tractors, combines, application equipment, grain storage systems, and replacement parts.',
  'Customers use the equipment through a global dealer network serving crop-production workflows.',
  'Competition depends on product performance, technology, distribution, pricing, financing, and aftermarket support.',
  ...Array.from({ length: 220 }, (_, index) => (
    index % 8 === 0
      ? 'AGCO product technology customer dealer performance'
      : 'primary filing evidence'
  ))
].join(' ');

const registryRows = [
  { cik: '880266', ticker: 'AGCO', companyName: 'AGCO CORP /DE' },
  { cik: '1567094', ticker: 'CNH', companyName: 'CNH Industrial N.V.' },
  { cik: '737758', ticker: 'TTC', companyName: 'TORO CO' },
  { cik: '1941131', ticker: 'TORO', companyName: 'TORO CORP.' },
  { cik: '18230', ticker: 'CAT', companyName: 'CATERPILLAR INC' }
];

const run = async () => {
  const mentions = extractExplicitCompetitorMentions({
    text: issuerText,
    issuerName: 'DEERE & CO'
  });
  assert.deepEqual(
    mentions.map(mention => mention.name),
    ['AGCO Corporation', 'CLAAS KGaA mbH', 'CNH Industrial N.V.', 'Kubota Tractor Corporation', 'The Toro Company', 'Caterpillar Inc.', 'Doosan Infracore Co.']
  );
  const agco = resolveCompetitorRegistryMatch({
    competitorName: 'AGCO Corporation',
    registryRows,
    issuerCik: '315189'
  });
  assert.equal(agco.ticker, 'AGCO');
  assert.equal(agco.cik, '0000880266');
  assert.equal(resolveCompetitorRegistryMatch({
    competitorName: 'The Toro Company',
    registryRows,
    issuerCik: '315189'
  }), null);

  const excerpt = extractCompetitorPrimaryExcerpt(competitorText);
  assert(excerpt.length >= 1200);
  assert.match(excerpt, /precision agriculture technology/);

  const calls = [];
  const acquired = await acquireCompetitorPrimarySource({
    issuer: {
      cik: '315189',
      ticker: 'DE',
      companyName: 'DEERE & CO'
    },
    issuerFiling: {
      text: issuerText,
      url: 'https://www.sec.gov/Archives/deere-10k.htm',
      accessionNumber: '0001104659-25-122321',
      filingDate: '2025-12-18'
    },
    fetchCompanyTickerRegistryFn: async () => registryRows,
    fetchCompanySubmissionsFn: async ({ cik }) => {
      calls.push(`submissions:${cik}`);
      assert.equal(cik, '0000880266');
      return annualSubmissions();
    },
    fetchFilingDocumentFn: async ({ url }) => {
      calls.push(`document:${url}`);
      return competitorText;
    },
    now: new Date('2026-07-26T21:00:00.000Z')
  });
  assert.equal(acquired.stop, null);
  assert.equal(acquired.evidence.provider, 'sec-edgar');
  assert.equal(acquired.evidence.status, 'ignored');
  assert.match(acquired.evidence.externalId, /^sec-edgar-competitor:/);
  assert.equal(acquired.evidence.text, competitorText);
  assert.equal(acquired.evidence.metadata.evidenceArchetype, 'competitor_primary');
  assert.equal(acquired.evidence.metadata.namedByIssuer.disclosedName, 'AGCO Corporation');
  assert.match(acquired.evidence.metadata.namedByIssuer.disclosureSentence, /AGCO Corporation/);
  assert.match(acquired.evidence.metadata.namedByIssuer.disclosureHash, /^[a-f0-9]{64}$/);
  assert.equal(acquired.evidence.metadata.competitorIssuer.ticker, 'AGCO');
  assert.equal(acquired.evidence.metadata.competitorIssuer.form, '10-K');
  assert.match(acquired.evidence.metadata.provenance.contentHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(calls, [
    'submissions:0000880266',
    'document:https://www.sec.gov/Archives/edgar/data/880266/000088026626000010/agco-20251231.htm'
  ]);

  const noMention = await acquireCompetitorPrimarySource({
    issuer: { cik: '315189', ticker: 'DE', companyName: 'DEERE & CO' },
    issuerFiling: {
      text: 'Competition is intense, but the issuer does not identify any company by name.',
      url: 'https://www.sec.gov/Archives/deere-10k.htm'
    },
    fetchCompanyTickerRegistryFn: async () => {
      throw new Error('Registry should not be loaded without an explicit name.');
    }
  });
  assert.equal(noMention.stop.code, 'EXPLICIT_NAMED_COMPETITOR_NOT_FOUND');

  const ambiguous = await acquireCompetitorPrimarySource({
    issuer: { cik: '315189', ticker: 'DE', companyName: 'DEERE & CO' },
    issuerFiling: {
      text: 'Competition. Our principal competitors are The Toro Company.',
      url: 'https://www.sec.gov/Archives/deere-10k.htm'
    },
    fetchCompanyTickerRegistryFn: async () => registryRows
  });
  assert.equal(ambiguous.stop.code, 'NAMED_COMPETITOR_SEC_IDENTITY_AMBIGUOUS');
};

if (require.main === module) {
  run()
    .then(() => console.log('investment dossier competitor source service tests passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
