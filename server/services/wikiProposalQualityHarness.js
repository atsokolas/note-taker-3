const {
  buildArchiveSignals,
  buildProposalCandidates
} = require('./wikiProposalService');

const visible = (proposals = []) => proposals.filter(proposal => ['pending', 'watched'].includes(String(proposal.status || 'pending')));

const fixtures = [
  {
    name: 'berkshire_letters_collapse',
    library: {
      articles: [1992, 1993, 1994, 1995, 1996, 1997].map((year, index) => ({
        _id: `berkshire-${year}`,
        title: 'Name: To the Shareholders of Berkshire Hathaway Inc.: by berkshirehathaway.com',
        url: `https://www.berkshirehathaway.com/letters/${year}.html`,
        content: `Berkshire Hathaway owner earnings and capital allocation letter ${year}.`,
        highlights: [{
          _id: `berkshire-highlight-${index}`,
          text: `Name: To the Shareholders of Berkshire Hathaway Inc. Owner earnings and Berkshire Hathaway investing lessons from ${year}.`,
          tags: ['Berkshire Hathaway']
        }]
      }))
    },
    existingPages: [],
    expectations: {
      visibleTitles: ['Berkshire Hathaway'],
      hiddenTitlePatterns: [/owner earning/i, /investing lesson/i],
      maxVisible: 1
    }
  },
  {
    name: 'existing_page_auto_merge',
    library: {
      articles: [1992, 1993, 1994].map((year, index) => ({
        _id: `berkshire-existing-${year}`,
        title: 'To the Shareholders of Berkshire Hathaway Inc.',
        url: `https://www.berkshirehathaway.com/letters/${year}.html`,
        highlights: [{
          _id: `berkshire-existing-highlight-${index}`,
          text: 'Berkshire Hathaway shareholder letters repeat owner earnings themes.',
          tags: ['Berkshire Hathaway']
        }]
      }))
    },
    existingPages: [{ _id: 'page-berkshire', title: 'Berkshire Hathaway', plainText: 'Existing page.' }],
    expectations: {
      visibleTitles: [],
      mergedTitlePatterns: [/berkshire hathaway/i],
      maxVisible: 0
    }
  },
  {
    name: 'distinct_tutor_topic_survives',
    library: {
      articles: [
        {
          _id: 'tutor-1',
          title: 'AI tutors and motivation',
          url: 'https://learning.example.com/ai-tutors',
          highlights: [{ _id: 'tutor-h1', text: 'AI tutors can increase student motivation through adaptive feedback.' }]
        },
        {
          _id: 'tutor-2',
          title: 'Motivation in adaptive learning',
          url: 'https://learning.example.com/adaptive-learning',
          highlights: [{ _id: 'tutor-h2', text: 'Adaptive tutors can improve motivation and practice consistency.' }]
        },
        {
          _id: 'tutor-3',
          title: 'Tutor notes',
          url: 'https://education.example.org/tutor-notes',
          highlights: [{ _id: 'tutor-h3', text: 'AI tutors and motivation recur in education software.' }]
        }
      ]
    },
    existingPages: [],
    expectations: {
      visibleTitles: ['Tutor Motivation'],
      maxVisible: 1
    }
  }
];

const evaluateFixture = (fixture) => {
  const signals = buildArchiveSignals(fixture.library || {});
  const proposals = buildProposalCandidates({ signals, existingPages: fixture.existingPages || [] });
  const shown = visible(proposals);
  const failures = [];
  const titles = shown.map(proposal => proposal.title);
  const allTitles = proposals.map(proposal => proposal.title);

  (fixture.expectations?.visibleTitles || []).forEach((title) => {
    if (!titles.includes(title)) failures.push(`Expected visible proposal "${title}".`);
  });
  (fixture.expectations?.hiddenTitlePatterns || []).forEach((pattern) => {
    if (shown.some(proposal => pattern.test(proposal.title))) failures.push(`Expected no visible title matching ${pattern}.`);
  });
  (fixture.expectations?.mergedTitlePatterns || []).forEach((pattern) => {
    if (!proposals.some(proposal => pattern.test(proposal.title) && proposal.proposalDecision?.action === 'merge_into_existing')) {
      failures.push(`Expected merged proposal matching ${pattern}.`);
    }
  });
  if (Number.isFinite(Number(fixture.expectations?.maxVisible)) && shown.length > Number(fixture.expectations.maxVisible)) {
    failures.push(`Expected at most ${fixture.expectations.maxVisible} visible proposals, got ${shown.length}.`);
  }
  if (shown.some(proposal => /<[^>]+>/.test(proposal.title) || /https?:\/\//i.test(proposal.title))) {
    failures.push('Visible proposal title contains markup or URL text.');
  }

  return {
    name: fixture.name,
    ok: failures.length === 0,
    failures,
    visibleTitles: titles,
    allTitles,
    decisions: proposals.map(proposal => ({
      title: proposal.title,
      action: proposal.proposalDecision?.action || 'unknown',
      status: proposal.status || 'pending',
      score: proposal.proposalDecision?.qualityScore || 0,
      rationale: proposal.proposalDecision?.rationale || proposal.dismissedReason || ''
    }))
  };
};

const runWikiProposalQualityHarness = ({ selectedFixtures = [] } = {}) => {
  const selected = selectedFixtures.length
    ? fixtures.filter(fixture => selectedFixtures.includes(fixture.name))
    : fixtures;
  const results = selected.map(evaluateFixture);
  const failed = results.filter(result => !result.ok);
  return {
    ok: failed.length === 0,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results
  };
};

module.exports = {
  evaluateFixture,
  fixtures,
  runWikiProposalQualityHarness
};
