const assert = require('assert');
const {
  evaluateWikiArticleQuality,
  __testables: { docFromArticle, GENERIC_REFERENCE_HEADINGS }
} = require('./wikiMaintenanceService');
const { extractOpenQuestionsFromBody } = require('./wikiOpenQuestionsService');

// The quality gate and the Open Questions feature disagreed about one heading.
// The gate rejected "Open Questions" as generic; wikiOpenQuestionsService reads
// a page's questions only from a section headed exactly that, and the Concept
// question board and briefing consume the result. A compliant article silently
// lost the feature. These tests pin both halves of the contract so neither side
// can drift back.

const ordinarySource = (overrides = {}) => ({
  type: 'article',
  objectId: '507f1f77bcf86cd799439011',
  title: 'Capital allocation and incremental returns',
  url: 'https://example.org/capital-allocation',
  snippet: 'Capital allocation sends each earned dollar back into the business, into buybacks, or into dividends, and the spread over the cost of capital decides whether that helps.',
  ...overrides
});

const articleWithOpenQuestions = {
  summary: {
    text: 'Capital allocation sends each earned dollar back into the business, into buybacks, or into dividends, and the spread over the cost of capital decides whether that helps.',
    citationIndexes: [1],
    support: 'supported'
  },
  sections: [
    {
      heading: 'Reinvestment above the cost of capital',
      paragraphs: [{
        text: 'Reinvestment creates value only while the return on incremental invested capital exceeds the cost of that capital, so reported growth alone establishes size rather than earning power.',
        citationIndexes: [1],
        support: 'supported'
      }],
      bullets: []
    },
    {
      heading: 'Open Questions',
      paragraphs: [{
        text: 'Which window of incremental return separates allocation skill from operating skill?',
        citationIndexes: [1],
        support: 'partial'
      }],
      bullets: []
    }
  ]
};

const run = () => {
  // 1. The landmark heading is no longer treated as template filler.
  assert.equal(
    GENERIC_REFERENCE_HEADINGS.has('open questions'),
    false,
    'Open Questions is a structural landmark other features navigate by, not a generic heading'
  );

  // 2. An article using it does not fail the gate for that heading.
  const body = docFromArticle({ title: 'Capital allocation', article: articleWithOpenQuestions });
  const quality = evaluateWikiArticleQuality({
    page: { title: 'Capital allocation', pageType: 'concept' },
    body,
    claims: [],
    sourceRefs: [ordinarySource()],
    skipDurableCitationCheck: true
  });
  assert.equal(
    quality.failures.some(failure => /generic section heading/i.test(failure)),
    false,
    `Open Questions must not count as a generic heading: ${quality.failures.join(' | ')}`
  );
  assert.equal(quality.metrics.ordinaryGenericHeadingCount, 0);

  // 3. The feature can still read the section the gate now permits. This is the
  //    half that actually broke: a gate-compliant article used to yield nothing.
  assert.deepEqual(
    extractOpenQuestionsFromBody(body),
    ['Which window of incremental return separates allocation skill from operating skill?']
  );

  // 4. Genuinely generic headings are still rejected. Relaxing one landmark must
  //    not relax the rule it belongs to.
  const genericBody = docFromArticle({
    title: 'Capital allocation',
    article: {
      summary: articleWithOpenQuestions.summary,
      sections: [
        { heading: 'How It Works', paragraphs: articleWithOpenQuestions.sections[0].paragraphs, bullets: [] },
        articleWithOpenQuestions.sections[1]
      ]
    }
  });
  const genericQuality = evaluateWikiArticleQuality({
    page: { title: 'Capital allocation', pageType: 'concept' },
    body: genericBody,
    claims: [],
    sourceRefs: [ordinarySource()],
    skipDurableCitationCheck: true
  });
  assert.equal(
    genericQuality.failures.some(failure => /generic section heading/i.test(failure)),
    true,
    'template headings other than the landmark must still fail'
  );
  assert.equal(genericQuality.metrics.ordinaryGenericHeadingCount, 1);

  console.log('wikiOpenQuestions heading contract tests passed');
};

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
