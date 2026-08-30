const assert = require('node:assert');
const {
  claimTerms,
  matchedTerms,
  answersClaim,
  explainMatch,
  snippetAround,
  candidatesFromArticle,
  rankCandidates,
  alreadyFiled,
  findLibraryEvidence
} = require('./judgmentEvidenceService');

// claimTerms
assert.deepStrictEqual(
  claimTerms('The demand for compute outruns deliverable capacity.'),
  ['demand', 'compute', 'outruns', 'deliverable', 'capacity'],
  'drops stopwords and short words, keeps the claim'
);
assert.deepStrictEqual(claimTerms('  '), [], 'an empty claim has no terms');
assert.deepStrictEqual(claimTerms('Capacity and capacity'), ['capacity'], 'each term once');
const terms = claimTerms('Demand for compute outruns deliverable capacity');

// matchedTerms: stems, so a plural in the passage still answers a singular claim
assert.deepStrictEqual(
  matchedTerms('Capacities were constrained all year', ['capacity', 'rates']),
  ['capacity'],
  'matches on the stem'
);
assert.deepStrictEqual(matchedTerms('nothing here', ['compute']), [], 'no false positives');
assert.strictEqual(answersClaim(['capacity'], terms), false, 'one leftover word does not answer a long hold');
assert.strictEqual(answersClaim(['demand', 'capacity'], terms), true, 'substantive coverage clears the bar');
assert.strictEqual(answersClaim(['compute'], ['compute', 'scarcity']), false, 'a two-term hold needs both ideas');
assert.strictEqual(
  explainMatch(['demand', 'capacity'], terms),
  'Answers 2 of 5 key terms · demand · capacity',
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
  content: '<p>Compute capacity is the binding constraint this cycle.</p>',
  createdAt: '2026-06-01T00:00:00.000Z',
  highlights: [
    { _id: 'h1', text: 'Deliverable capacity lags demand by two years.', createdAt: '2026-06-02T00:00:00.000Z' },
    { _id: 'h2', text: 'Unrelated aside about logistics.' }
  ]
};
const rows = candidatesFromArticle(article, terms);
assert.strictEqual(rows.length, 1, 'only highlights that actually match are offered');
assert.strictEqual(rows[0].kind, 'highlight');
assert.strictEqual(rows[0].highlightId, 'h1');
assert.strictEqual(rows[0].sourceLabel, 'On compute · FT', 'provenance travels with the line');
assert.ok(rows[0].matched.includes('capacity'), 'the matched words are reported');
assert.match(rows[0].whyThisSource, /^Answers 3 of 5 key terms/, 'the reason for selection travels with the passage');
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
const fakeArticle = (articles) => ({
  find: () => ({
    sort: () => ({
      limit: () => ({ lean: async () => articles })
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
  assert.strictEqual(found.candidates.length, 1);
  assert.strictEqual(found.candidates[0].highlightId, 'h1');
  assert.ok(found.terms.includes('capacity'));

  const alreadyDecided = await findLibraryEvidence({
    Article: fakeArticle([article]),
    userId: 'u1',
    claim: 'Demand for compute outruns deliverable capacity',
    judgment: { why: [{ acceptedFrom: 'highlight:a1:h1' }] }
  });
  assert.deepStrictEqual(alreadyDecided.candidates, [], 'what you already filed is not offered again');

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

  console.log('judgmentEvidenceService tests passed');
})();

/* Evergreen: a kept source does not beat a passage that answers more of the claim. */
{
  const { EVERGREEN_BONUS } = require('./judgmentEvidenceService');
  const terms2 = claimTerms('Demand for compute outruns deliverable capacity');
  const kept = {
    _id: 'keeper', title: 'The capacity wall', evergreen: true,
    content: '<p>Capacity is the binding constraint.</p>', highlights: []
  };
  const passing = {
    _id: 'passing', title: 'A note on capacity and demand', evergreen: false,
    content: '<p>Capacity and demand and compute and deliverable timelines.</p>', highlights: []
  };

  const keptRow = candidatesFromArticle(kept, terms2)[0];
  const passingRow = candidatesFromArticle(passing, terms2)[0];
  assert.strictEqual(keptRow.evergreen, true, 'the row says it is evergreen');
  assert.strictEqual(passingRow.evergreen, false);
  assert.ok(
    passingRow.score > keptRow.score,
    'covering the sentence outranks an evergreen leftover'
  );
  assert.ok(EVERGREEN_BONUS > 0);

  const order = rankCandidates([passingRow, keptRow], 5).map(row => row.id);
  assert.strictEqual(order[0], 'article:passing', 'and the answering source comes back first');

  console.log('evergreen retrieval tests passed');
}
