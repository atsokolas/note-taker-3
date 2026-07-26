const assert = require('node:assert/strict');
const {
  acquireIndependentDomainSource,
  assessIndependentDocument,
  resolveIndependentSourceDescriptor
} = require('./investmentDossierIndependentSourceService');

const reportMarkdown = `
# Precision Agriculture: Benefits and Challenges for Technology Adoption and Use

GAO-24-105962 Published: Jan 31, 2024.

${'Precision agriculture adoption can improve customer economics and farm productivity. '.repeat(90)}
High up-front costs can prevent adoption. Farm data sharing and data ownership create
commercial and technical risks. A lack of uniform standards can hamper interoperability.
`;

const run = async () => {
  const descriptor = resolveIndependentSourceDescriptor({
    sic: '3523',
    sicDescription: 'Farm Machinery & Equipment'
  });
  assert.equal(descriptor.id, 'gao-precision-agriculture-2024');
  assert.equal(resolveIndependentSourceDescriptor({ sic: '7372' }), null);

  const assessment = assessIndependentDocument({
    descriptor,
    document: {
      title: 'U.S. GAO - Precision Agriculture: Benefits and Challenges for Technology Adoption and Use',
      markdown: reportMarkdown
    }
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.matchedSignals, [
    'precision_agriculture',
    'adoption',
    'customer_economics',
    'data_rights',
    'interoperability'
  ]);

  let submissionsCalls = 0;
  let readerCalls = 0;
  const acquired = await acquireIndependentDomainSource({
    cik: '0000315189',
    fetchCompanySubmissionsFn: async () => {
      submissionsCalls += 1;
      return { sic: '3523', sicDescription: 'Farm Machinery & Equipment' };
    },
    fetchReaderDocumentFn: async ({ url, officialWebsite }) => {
      readerCalls += 1;
      assert.equal(url, 'https://www.gao.gov/products/gao-24-105962');
      assert.equal(officialWebsite, 'https://www.gao.gov/');
      return {
        title: 'U.S. GAO - Precision Agriculture: Benefits and Challenges for Technology Adoption and Use',
        sourceUrl: url,
        markdown: reportMarkdown
      };
    },
    now: new Date('2026-07-26T20:30:00.000Z')
  });
  assert.equal(submissionsCalls, 1);
  assert.equal(readerCalls, 1);
  assert.equal(acquired.stop, null);
  assert.equal(acquired.sourceRef.provider, 'gao-technology-assessment');
  assert.equal(acquired.sourceRef.metadata.evidenceArchetype, 'independent_domain');
  assert.equal(acquired.sourceRef.metadata.sic, '3523');
  assert.equal(acquired.sourceRef.metadata.validation.status, 'accepted');
  assert.match(acquired.sourceRef.metadata.provenance.contentHash, /^[a-f0-9]{64}$/);

  const unsupported = await acquireIndependentDomainSource({
    cik: '0001652044',
    fetchCompanySubmissionsFn: async () => ({
      sic: '7370',
      sicDescription: 'Services-Computer Programming, Data Processing, Etc.'
    }),
    fetchReaderDocumentFn: async () => {
      throw new Error('Reader must not run without a registry match.');
    }
  });
  assert.equal(unsupported.sourceRef, null);
  assert.equal(unsupported.stop.code, 'INDEPENDENT_DOMAIN_COVERAGE_UNAVAILABLE');
  assert.match(unsupported.stop.message, /will not attach a generic government page/i);

  const insufficient = await acquireIndependentDomainSource({
    cik: '0000315189',
    sic: '3523',
    sicDescription: 'Farm Machinery & Equipment',
    fetchCompanySubmissionsFn: async () => {
      throw new Error('SIC lookup should be skipped when the profile already has it.');
    },
    fetchReaderDocumentFn: async () => ({
      title: 'U.S. GAO - Precision Agriculture: Benefits and Challenges for Technology Adoption and Use',
      sourceUrl: 'https://www.gao.gov/products/gao-24-105962',
      markdown: 'GAO-24-105962. Precision agriculture.'
    })
  });
  assert.equal(insufficient.sourceRef, null);
  assert.equal(insufficient.stop.code, 'INDEPENDENT_DOMAIN_SOURCE_INSUFFICIENT');

  console.log('investment dossier independent source service tests passed');
};

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
