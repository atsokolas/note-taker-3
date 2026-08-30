const assert = require('node:assert');
const {
  claimTerms,
  matchedTerms,
  answersClaim,
  explainMatch,
  bestEvidencePassage,
  passageQuality,
  answersExactPassage,
  snippetAround,
  candidatesFromArticle,
  rankCandidates,
  alreadyFiled,
  findLibraryEvidence,
  HIGHLIGHT_SCAN_LIMIT,
  BODY_SCAN_LIMIT,
  SEARCH_TERM_LIMIT,
  QUERY_TIMEOUT_MS,
  searchTermsForClaim,
  searchPatternForClaim
} = require('./judgmentEvidenceService');

// claimTerms
assert.deepStrictEqual(
  claimTerms('The demand for compute outruns deliverable capacity.'),
  ['demand', 'compute', 'outruns', 'deliverable', 'capacity'],
  'drops stopwords and short words, keeps the claim'
);
assert.deepStrictEqual(claimTerms('  '), [], 'an empty claim has no terms');
assert.deepStrictEqual(claimTerms('Capacity and capacity'), ['capacity'], 'each term once');
assert.deepStrictEqual(
  searchTermsForClaim(['one', 'extraordinary', 'three', 'discriminating'], 2),
  ['extraordinary', 'discriminating'],
  'long claims search with their most discriminating words while preserving sentence order'
);
assert.strictEqual(
  searchTermsForClaim(Array.from({ length: SEARCH_TERM_LIMIT + 5 }, (_, index) => `term-${index}`)).length,
  SEARCH_TERM_LIMIT,
  'paragraph-sized judgments cannot create an unbounded text query'
);
assert.ok(searchPatternForClaim(['costco', 'owner-value']).test('Owner-value at Costco'), 'search regex is escaped and case-insensitive');
const terms = claimTerms('Demand for compute outruns deliverable capacity');

// matchedTerms: stems, so a plural in the passage still answers a singular claim
assert.deepStrictEqual(
  matchedTerms('Capacities were constrained all year', ['capacity', 'rates']),
  ['capacity'],
  'matches on the stem'
);
assert.deepStrictEqual(matchedTerms('nothing here', ['compute']), [], 'no false positives');
assert.strictEqual(answersClaim(['capacity'], terms), false, 'one leftover word does not answer a long hold');
assert.strictEqual(answersClaim(['demand', 'capacity'], terms), false, 'two topic words do not establish a five-term relationship');
assert.strictEqual(answersClaim(['demand', 'compute', 'capacity'], terms), false, 'three topic words do not clear a five-term relationship');
assert.strictEqual(answersClaim(['demand', 'compute', 'deliverable', 'capacity'], terms), true, 'two-thirds of a longer sentence clears the bar');
assert.strictEqual(answersClaim(['compute'], ['compute', 'scarcity']), false, 'a two-term hold needs both ideas');
assert.strictEqual(
  answersExactPassage(
    passageQuality('The onboarding team interviewed customers about the new color palette.', claimTerms('Shorter onboarding improves activation for new customers.')),
    claimTerms('Shorter onboarding improves activation for new customers.')
  ),
  false,
  'half the nouns without the claim relationship is only a topic match'
);
assert.strictEqual(
  explainMatch(['demand', 'compute', 'deliverable', 'capacity'], terms),
  'Answers 4 of 5 key terms · demand · compute · deliverable · capacity',
  'the selection explains itself in the claim\'s own words'
);

// snippetAround centres on the match rather than truncating from the start
const long = `${'filler '.repeat(60)}the capacity constraint is real${' tail'.repeat(60)}`;
const snippet = snippetAround(long, ['capacity'], 120);
assert.ok(snippet.includes('capacity'), 'the matched word survives the trim');
assert.ok(snippet.length <= 130, 'and the snippet stays within budget');
assert.strictEqual(snippetAround('short text', ['short'], 120), 'short text', 'short text is untouched');

// candidatesFromArticle: the reader's own highlights outrank the body
const article = {
  _id: 'a1',
  title: 'On compute',
  siteName: 'FT',
  url: 'https://example.com/a1',
  content: '<p>Compute demand outruns available capacity this cycle.</p>',
  createdAt: '2026-06-01T00:00:00.000Z',
  highlights: [
    { _id: 'h1', text: 'Deliverable compute capacity lags demand by two years.', createdAt: '2026-06-02T00:00:00.000Z' },
    { _id: 'h2', text: 'Unrelated aside about logistics.' }
  ]
};
const rows = candidatesFromArticle(article, terms);
assert.strictEqual(rows.length, 2, 'an answering highlight and a distinct answering article passage are both eligible');
assert.strictEqual(rows[0].kind, 'highlight');
assert.strictEqual(rows[0].highlightId, 'h1');
assert.strictEqual(rows[0].sourceLabel, 'On compute · FT', 'provenance travels with the line');
assert.ok(rows[0].matched.includes('capacity'), 'the matched words are reported');
assert.match(rows[0].whyThisSource, /^Answers 4 of 5 key terms/, 'the reason for selection travels with the passage');
// Nothing about which side it falls on: term overlap cannot tell support from contradiction.
assert.strictEqual(rows[0].side, undefined, 'the service never guesses a side');

const noHighlights = candidatesFromArticle({ ...article, highlights: [] }, terms);
assert.strictEqual(noHighlights.length, 1, 'a source with no highlights falls back to its own words');
assert.strictEqual(noHighlights[0].kind, 'source');

const irrelevant = candidatesFromArticle(
  { _id: 'a2', title: 'Gardening', content: 'Roses need pruning.', highlights: [] },
  terms
);
assert.deepStrictEqual(irrelevant, [], 'a source about nothing relevant offers nothing');

const exactPassage = bestEvidencePassage(
  'The introduction is unrelated. Demand for compute is rising quickly. Deliverable capacity remains constrained.',
  terms
);
assert.strictEqual(
  exactPassage.text,
  'Demand for compute is rising quickly. Deliverable capacity remains constrained.',
  'the visible quotation is the smallest complete passage that clears the bar'
);

const noteOnly = candidatesFromArticle({
  _id: 'note-only',
  title: 'A saved aside',
  content: 'Nothing about the held sentence.',
  highlights: [{ _id: 'h-note', text: 'A generic observation.', note: 'Demand compute deliverable capacity.' }]
}, terms);
assert.deepStrictEqual(noteOnly, [], 'a note cannot qualify unrelated quoted words');

const titleOnly = candidatesFromArticle({
  _id: 'title-only',
  title: 'Demand, compute, and deliverable capacity',
  content: 'This article body is only about office lunch.',
  highlights: []
}, terms);
assert.deepStrictEqual(titleOnly, [], 'a matching title cannot qualify unrelated body text');

const bodyBeatsHighlight = rankCandidates(candidatesFromArticle({
  _id: 'body-wins',
  title: 'Capacity notes',
  content: 'Demand for compute outruns deliverable capacity across the next two years.',
  highlights: [{ _id: 'thin-highlight', text: 'Demand and capacity remain linked.' }]
}, terms), 5);
assert.strictEqual(bodyBeatsHighlight[0].id, 'article:body-wins', 'a thin highlight cannot hide the stronger article passage');

// rankCandidates
const ranked = rankCandidates([
  { id: 'low', score: 1, savedAt: '2026-08-01T00:00:00.000Z' },
  { id: 'high', score: 9, savedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'mid', score: 3, savedAt: '2026-01-01T00:00:00.000Z' }
], 2);
assert.deepStrictEqual(ranked.map(r => r.id), ['high', 'mid'], 'strongest first, and the limit holds');

// alreadyFiled: a passage the reader has already decided about is not offered back
const filed = alreadyFiled({
  why: [{ text: 'Deliverable capacity lags demand by two years.', acceptedFrom: 'highlight:a1:h1' }],
  against: []
});
assert.ok(filed.has('highlight:a1:h1'), 'filed by id');
assert.ok(filed.has('text:deliverable capacity lags demand by two years.'), 'and by text');

// findLibraryEvidence, against a fake model
const queryCalls = [];
const fakeArticle = (articles) => ({
  find: (filter, projection) => ({
    sort: () => ({
      limit: (limit) => {
        const query = {
          maxTimeMS: (timeout) => {
            queryCalls.push({ filter, projection, limit, timeout });
            return query;
          },
          lean: async () => articles.map((row) => {
            if (projection.content) return { ...row, highlights: [] };
            return { ...row, content: undefined };
          })
        };
        return query;
      }
    })
  })
});

(async () => {
  const empty = await findLibraryEvidence({ Article: fakeArticle([]), userId: 'u1', claim: 'the and of' });
  assert.deepStrictEqual(empty.candidates, [], 'a claim made only of stopwords searches for nothing');

  const found = await findLibraryEvidence({
    Article: fakeArticle([article]),
    userId: 'u1',
    claim: 'Demand for compute outruns deliverable capacity'
  });
  assert.strictEqual(found.candidates.length, 2);
  assert.ok(found.candidates.some(candidate => candidate.highlightId === 'h1'));
  assert.strictEqual(found.candidates[0].id, 'article:a1', 'the more complete visible passage ranks first');
  assert.ok(found.terms.includes('capacity'));
  const [highlightCall, bodyCall] = queryCalls.slice(-2);
  assert.strictEqual(highlightCall.limit, HIGHLIGHT_SCAN_LIMIT, 'the saved-passage scan stays bounded');
  assert.strictEqual(bodyCall.limit, BODY_SCAN_LIMIT, 'the full-body scan stays smaller than the passage scan');
  assert.strictEqual(highlightCall.timeout, QUERY_TIMEOUT_MS, 'Mongo owns a finite highlight-read deadline');
  assert.strictEqual(bodyCall.timeout, QUERY_TIMEOUT_MS, 'Mongo owns a finite body-read deadline');
  assert.ok(highlightCall.projection.highlights.$elemMatch, 'only a matching saved passage is hydrated per source');
  assert.strictEqual(bodyCall.projection.content, 1, 'the visible article passage survives the bounded body read');
  assert.ok(highlightCall.filter['highlights.text'].test('deliverable capacity'), 'the passage query carries claim language');
  assert.ok(bodyCall.filter.content.test('compute demand'), 'the body query carries claim language');

  const alreadyDecided = await findLibraryEvidence({
    Article: fakeArticle([article]),
    userId: 'u1',
    claim: 'Demand for compute outruns deliverable capacity',
    judgment: { why: [{ acceptedFrom: 'highlight:a1:h1' }] }
  });
  assert.ok(
    alreadyDecided.candidates.every(candidate => candidate.highlightId !== 'h1'),
    'the exact passage already filed is not offered again'
  );

  const leftover = await findLibraryEvidence({
    Article: fakeArticle([{
      _id: 'thin', title: 'Capacity note', content: 'Capacity exists.', highlights: []
    }]),
    userId: 'u1',
    claim: 'Demand for compute outruns deliverable capacity'
  });
  assert.deepStrictEqual(leftover.candidates, [], 'a single shared word is honest silence, not evidence');

  const noModel = await findLibraryEvidence({ userId: 'u1', claim: 'compute capacity' });
  assert.deepStrictEqual(noModel.candidates, [], 'survives a missing model');

  const hireNote = {
    _id: 'note-1',
    title: 'Hiring notes',
    content: '<p>Unrelated logistics.</p>',
    createdAt: '2026-08-20T00:00:00.000Z',
    highlights: [
      { _id: 'h-maya', text: 'Maya is the engineer I would hire first.', createdAt: '2026-08-21T00:00:00.000Z' }
    ]
  };
  const hired = await findLibraryEvidence({
    Article: fakeArticle([hireNote]),
    userId: 'u1',
    claim: 'Hire Maya as the first engineer.'
  });
  assert.strictEqual(hired.candidates.length, 1, 'a hire claim is answered by a saved note, not a ticker');
  assert.strictEqual(hired.candidates[0].highlightId, 'h-maya');
  assert.strictEqual(hired.candidates[0].id, 'highlight:note-1:h-maya');
  assert.ok(!hired.terms.includes('nvidia') && !hired.terms.includes('ticker'));

  const filedHire = await findLibraryEvidence({
    Article: fakeArticle([hireNote]),
    userId: 'u1',
    claim: 'Hire Maya as the first engineer.',
    judgment: { why: [{ acceptedFrom: 'highlight:note-1:h-maya' }] }
  });
  assert.deepStrictEqual(filedHire.candidates, [], 'a Why already filed from that passage is not offered again');

  /* Arbitrary-sentence gauntlet. These are deliberately unrelated domains:
     the retrieval boundary is the sentence, never a ticker or dossier shape.
     Each fixture contains a passage on either side. Retrieval must surface
     both with exact provenance and must not pretend lexical overlap knows
     which one supports or challenges the hold. */
  const gauntlet = [
    {
      claim: 'Consistent bedtime routines improve children sleep quality.',
      support: 'Consistent bedtime routines improve children sleep quality across the school week.',
      counter: 'Consistent bedtime routines did not improve children sleep quality in the trial.'
    },
    {
      claim: 'Shorter onboarding improves activation for new customers.',
      support: 'Shorter onboarding improves activation for new customers by removing setup work.',
      counter: 'Shorter onboarding did not improve activation for new customers who needed guidance.'
    },
    {
      claim: 'Maya should be the first engineer hired.',
      support: 'Maya should be the first engineer hired because she owns the critical systems.',
      counter: 'Maya should not be the first engineer hired while the product role remains open.'
    },
    {
      claim: 'Debate training reduces reward hacking in language models.',
      support: 'Debate training reduces reward hacking in language models under adversarial evaluation.',
      counter: 'Debate training did not reduce reward hacking in language models outside the benchmark.'
    },
    {
      claim: 'Costco membership renewal can remain above ninety percent.',
      support: 'Costco membership renewal remained above ninety percent in the reported period.',
      counter: 'Costco membership renewal may fall below ninety percent when household budgets tighten.'
    }
  ];

  for (const [index, scenario] of gauntlet.entries()) {
    const articles = ['support', 'counter'].map((direction) => ({
      _id: `${direction}-${index}`,
      title: `${direction} passage ${index}`,
      url: `https://example.com/${direction}-${index}`,
      highlights: [{ _id: `${direction}-highlight-${index}`, text: scenario[direction] }]
    }));
    const result = await findLibraryEvidence({
      Article: fakeArticle(articles),
      userId: 'u1',
      claim: scenario.claim
    });
    assert.deepStrictEqual(
      new Set(result.candidates.map(candidate => candidate.articleId)),
      new Set([`support-${index}`, `counter-${index}`]),
      `both ends of arbitrary sentence ${index + 1} survive the quality bar`
    );
    result.candidates.forEach((candidate) => {
      assert.ok(candidate.highlightId, 'the exact saved passage identity travels with the result');
      assert.ok(candidate.url, 'the exact source door travels with the result');
      assert.strictEqual(candidate.side, undefined, 'retrieval leaves semantic disposition to agent plus human');
    });
  }

  console.log('judgmentEvidenceService tests passed');
})();

/* Evergreen: a kept source does not beat a passage that answers more of the claim. */
{
  const { EVERGREEN_BONUS } = require('./judgmentEvidenceService');
  const terms2 = claimTerms('Demand for compute outruns deliverable capacity');
  const kept = {
    _id: 'keeper', title: 'The capacity wall', evergreen: true,
    content: '<p>Demand for compute meets deliverable capacity.</p>', highlights: []
  };
  const passing = {
    _id: 'passing', title: 'A note on capacity and demand', evergreen: false,
    content: '<p>Demand for compute outruns deliverable capacity.</p>', highlights: []
  };

  const keptRow = candidatesFromArticle(kept, terms2)[0];
  const passingRow = candidatesFromArticle(passing, terms2)[0];
  assert.strictEqual(keptRow.evergreen, true, 'the row says it is evergreen');
  assert.strictEqual(passingRow.evergreen, false);
  assert.ok(EVERGREEN_BONUS > 0);

  const order = rankCandidates([passingRow, keptRow], 5).map(row => row.id);
  assert.strictEqual(order[0], 'article:passing', 'coverage outranks the evergreen whisper');

  console.log('evergreen retrieval tests passed');
}
