const assert = require('node:assert/strict');
const {
  COMPANY_DOSSIER_MIN_SOURCE_COUNT,
  buildCompanyDossierEvidenceCoverage
} = require('./companyDossierEvidenceService');

const source = (evidenceArchetype, index) => ({
  title: `Source ${index}`,
  url: `https://example.com/${index}`,
  metadata: { evidenceArchetype }
});

const run = () => {
  const filingsOnly = buildCompanyDossierEvidenceCoverage({
    page: {
      sourceRefs: Array.from({ length: COMPANY_DOSSIER_MIN_SOURCE_COUNT }, (_, index) => ({
        title: `SEC filing ${index}`,
        provider: 'sec-edgar',
        url: `https://www.sec.gov/Archives/${index}`
      }))
    }
  });
  assert.equal(filingsOnly.ready, false);
  assert.equal(filingsOnly.sourceCount, 8);
  assert.deepEqual(filingsOnly.observedEvidenceArchetypes, ['filing']);
  assert.deepEqual(filingsOnly.missingEvidenceArchetypes, [
    'company_product',
    'competitor_primary',
    'independent_domain',
    'market_snapshot'
  ]);
  assert.match(filingsOnly.message, /official product/);

  const complete = buildCompanyDossierEvidenceCoverage({
    page: {
      sourceRefs: [
        source('filing', 1),
        source('company_product', 2),
        source('competitor_primary', 3),
        source('independent_domain', 4),
        source('market_snapshot', 5),
        source('filing', 6),
        source('company_product', 7),
        source('independent_domain', 8)
      ]
    }
  });
  assert.equal(complete.ready, true);
  assert.equal(complete.status, 'ready_for_draft');
  assert.equal(complete.missingSourceCount, 0);
  assert.deepEqual(complete.missingEvidenceArchetypes, []);

  const adapterGap = buildCompanyDossierEvidenceCoverage({
    page: {
      sourceRefs: complete.ready ? [
        source('filing', 1),
        source('company_product', 2),
        source('competitor_primary', 3),
        source('independent_domain', 4),
        source('market_snapshot', 5),
        source('filing', 6),
        source('company_product', 7),
        source('independent_domain', 8)
      ] : [],
      investmentDossier: {
        researchPlan: {
          requiredEvidenceArchetypes: [
            'filing',
            'company_product',
            'competitor_primary',
            'independent_domain',
            'market_snapshot',
            'operating_benchmark'
          ]
        }
      }
    }
  });
  assert.equal(adapterGap.ready, false);
  assert.deepEqual(adapterGap.missingEvidenceArchetypes, ['operating_benchmark']);

  const stopped = buildCompanyDossierEvidenceCoverage({
    page: {
      sourceRefs: [],
      investmentDossier: {
        acquisition: {
          companyFacts: {
            stop: {
              code: 'OPERATING_BENCHMARK_UNAVAILABLE',
              message: 'SEC Company Facts did not contain a comparable operating series.'
            }
          }
        }
      }
    }
  });
  assert.deepEqual(
    stopped.acquisitionStops.map(stop => stop.code),
    ['OPERATING_BENCHMARK_UNAVAILABLE']
  );
  assert.match(stopped.message, /did not contain a comparable operating series/);
};

if (require.main === module) {
  try {
    run();
    console.log('company dossier evidence service tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
