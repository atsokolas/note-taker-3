const assert = require('assert');

const {
  getWikiPageStructure,
  getWikiPageStructureForPage,
  INVESTMENT_DOSSIER_SECTIONS,
  isInvestmentDossierPage,
  alignArticleToPageStructure,
  normalizePageType
} = require('./wikiPageStructureService');

const run = () => {
  assert.strictEqual(normalizePageType('person'), 'entity');
  assert.strictEqual(normalizePageType('synthesis'), 'overview');
  assert.strictEqual(normalizePageType('topic'), 'topic');
  assert.strictEqual(normalizePageType('comparison'), 'comparison');
  assert.strictEqual(normalizePageType('unknown'), 'topic');

  const entity = getWikiPageStructure('person');
  assert.strictEqual(entity.type, 'entity');
  assert.strictEqual(entity.label, 'Entity');
  ['entity', 'concept', 'overview', 'topic'].forEach((pageType) => {
    assert.strictEqual(getWikiPageStructure(pageType).flexibleSections, true, `${pageType} should use subject-specific sections`);
  });
  ['source', 'question', 'comparison', 'project', 'log', 'repo'].forEach((pageType) => {
    assert.strictEqual(Boolean(getWikiPageStructure(pageType).flexibleSections), false, `${pageType} should retain its workflow structure`);
  });

  const overview = getWikiPageStructure('synthesis');
  assert.strictEqual(overview.type, 'overview');
  assert.strictEqual(overview.label, 'Overview');
  assert.strictEqual(overview.flexibleSections, true);

  const concept = getWikiPageStructure('concept');
  assert.strictEqual(concept.flexibleSections, true);
  const flexibleArticle = alignArticleToPageStructure({
    pageType: 'concept',
    article: {
      sections: [
        { heading: 'Compounding frequency', paragraphs: [], bullets: [] },
        { heading: 'Continuous compounding', paragraphs: [], bullets: [] }
      ]
    }
  });
  assert.deepStrictEqual(
    flexibleArticle.sections.map(section => section.heading),
    ['Compounding frequency', 'Continuous compounding']
  );
  const flexibleOverviewArticle = alignArticleToPageStructure({
    pageType: 'overview',
    article: {
      sections: [
        { heading: 'Nominal and effective rates', paragraphs: [], bullets: [] },
        { heading: 'When the compounding analogy breaks', paragraphs: [], bullets: [] }
      ]
    }
  });
  assert.deepStrictEqual(
    flexibleOverviewArticle.sections.map(section => section.heading),
    ['Nominal and effective rates', 'When the compounding analogy breaks']
  );

  assert.strictEqual(isInvestmentDossierPage({
    page: { pageType: 'entity', externalWatches: { edgar: { ticker: 'NVDA' } } }
  }), true);
  assert.strictEqual(isInvestmentDossierPage({
    page: { pageType: 'source' },
    candidates: [{ provider: 'sec-edgar' }]
  }), true);
  assert.strictEqual(isInvestmentDossierPage({
    page: { pageType: 'repo', externalWatches: { edgar: { ticker: 'NVDA' } } }
  }), false);

  const dossier = getWikiPageStructureForPage({
    page: { pageType: 'entity', externalWatches: { edgar: { cik: '0001045810' } } }
  });
  assert.strictEqual(dossier.profile, 'investment_dossier');
  assert.deepStrictEqual(dossier.sections, INVESTMENT_DOSSIER_SECTIONS);

  const aligned = alignArticleToPageStructure({
    pageType: 'entity',
    structure: dossier,
    article: {
      sections: [
        { heading: 'Product and Technical Moat', paragraphs: [], bullets: [] },
        { heading: 'Current Judgment', paragraphs: [], bullets: [] }
      ]
    }
  });
  assert.deepStrictEqual(
    aligned.sections.map(section => section.heading),
    INVESTMENT_DOSSIER_SECTIONS
  );

  const alignedDossierAlias = alignArticleToPageStructure({
    pageType: 'entity',
    structure: dossier,
    article: {
      sections: [
        ...INVESTMENT_DOSSIER_SECTIONS.slice(0, -1).map(heading => ({ heading, paragraphs: [], bullets: [] })),
        {
          heading: 'Next Evidence & Maintenance',
          paragraphs: [{ text: 'Recheck customer concentration and financing terms in the next 10-Q.' }],
          bullets: []
        }
      ]
    }
  });
  assert.strictEqual(
    alignedDossierAlias.sections.at(-1).paragraphs[0].text,
    'Recheck customer concentration and financing terms in the next 10-Q.'
  );
};

if (require.main === module) {
  try {
    run();
    console.log('wikiPageStructureService tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
