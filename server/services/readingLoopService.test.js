const assert = require('assert');
const { __testables } = require('./readingLoopService');

const {
  applyRelationGates,
  cardFromRelation,
  collectClaimCandidates,
  collectRecentSet,
  findDormantMatches,
  generateConnection,
  generateThread,
  hydrateCandidate,
  isDormant,
  isRecentlyShown,
  isSuppressed,
  normalizeForQuoteMatch,
  pairKey,
  pruneLedgers,
  quoteAppearsInSource,
  runRelationPass,
  runsUsedToday,
  safeJsonParse,
  serializeMechanic,
  similarityBand,
  engagementText,
  lastEngagementAt,
  DORMANT_MIN_AGE_MS,
  RECENT_WINDOW_MS
} = __testables;

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-13T12:00:00Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY_MS);

/* ------------------------------------------------------------------ *
 * Quote verification — the gate that keeps fabricated evidence out.
 * ------------------------------------------------------------------ */

const SOURCE = 'Grading rubrics decay over time. The judge model drifts toward its own priors, and nobody notices until the scores stop tracking reality.';

assert.strictEqual(quoteAppearsInSource('The judge model drifts toward its own priors', SOURCE), true);
assert.strictEqual(quoteAppearsInSource('the JUDGE model   drifts toward its own priors', SOURCE), true, 'case and whitespace are cosmetic');
assert.strictEqual(quoteAppearsInSource('The judge model drifts toward its own priors…', SOURCE), true, 'a trailing ellipsis is cosmetic');
assert.strictEqual(quoteAppearsInSource('“The judge model drifts toward its own priors”', SOURCE), true, 'smart quotes are cosmetic');
assert.strictEqual(quoteAppearsInSource('The judge model drifts toward its own biases', SOURCE), false, 'a paraphrase is not a quote');
assert.strictEqual(quoteAppearsInSource('Judges are unreliable over time', SOURCE), false, 'an invented quote is rejected');
assert.strictEqual(quoteAppearsInSource('decay', SOURCE), false, 'a fragment too short to be evidence is rejected');
assert.strictEqual(quoteAppearsInSource('anything', ''), false);

assert.strictEqual(
  quoteAppearsInSource('drifts toward its own priors', '<p>The judge model <em>drifts toward its own priors</em>.</p>'),
  true,
  'HTML markup in the source does not break verification'
);

assert.strictEqual(normalizeForQuoteMatch('  A—B  “c” '), 'a-b "c"');

/* ------------------------------------------------------------------ *
 * Relation gates.
 * ------------------------------------------------------------------ */

const recentItem = { type: 'article', id: 'r1', title: 'Eval harnesses', text: SOURCE, at: daysAgo(2), href: '/articles/r1' };
const dormantItem = { type: 'article', id: 'd1', title: 'Measuring What Matters', text: 'Rubrics decay, but the mechanism was never clear to us.', at: daysAgo(200), href: '/articles/d1' };

const goodProposal = {
  relation: 'fills_gap',
  recentQuote: 'The judge model drifts toward its own priors',
  olderQuote: 'Rubrics decay, but the mechanism was never clear to us',
  olderHolds: 'says rubrics decay without saying why',
  newerDoes: 'names the cause: judge models drift toward their own priors'
};

const gated = applyRelationGates({ parsed: goodProposal, recent: recentItem, dormant: dormantItem });
assert.ok(gated, 'a well-formed proposal with verifiable quotes passes');
assert.strictEqual(gated.relation, 'fills_gap');
assert.strictEqual(gated.relationLabel, 'fills a gap in');
assert.strictEqual(gated.lines.length, 1);
// The model supplies two clauses; the sentence frame is ours, which is what
// makes "two independent summaries" structurally impossible.
assert.ok(gated.lines[0].startsWith('The older piece says rubrics decay without saying why.'), gated.lines[0]);
assert.ok(gated.lines[0].includes('The newer one names the cause'), gated.lines[0]);

assert.strictEqual(
  applyRelationGates({ parsed: { ...goodProposal, relation: 'related' }, recent: recentItem, dormant: dormantItem }),
  null,
  '"related" is not a relation and must never render'
);
assert.strictEqual(
  applyRelationGates({ parsed: { ...goodProposal, relation: null }, recent: recentItem, dormant: dormantItem }),
  null,
  'an explicit null relation is a supported, silent outcome'
);
assert.strictEqual(
  applyRelationGates({ parsed: { ...goodProposal, recentQuote: 'The judge model becomes biased over time' }, recent: recentItem, dormant: dormantItem }),
  null,
  'a fabricated quote on the recent side suppresses the card'
);
assert.strictEqual(
  applyRelationGates({ parsed: { ...goodProposal, olderQuote: 'We always knew the mechanism' }, recent: recentItem, dormant: dormantItem }),
  null,
  'a fabricated quote on the dormant side suppresses the card'
);
assert.strictEqual(
  applyRelationGates({ parsed: { ...goodProposal, newerDoes: '' }, recent: recentItem, dormant: dormantItem }),
  null,
  'half a relation is not a relation'
);
// A slot that opens with a determiner or pronoun is a sentence in disguise —
// which is exactly how "two independent summaries" gets back in.
assert.strictEqual(
  applyRelationGates({
    parsed: { ...goodProposal, newerDoes: 'The recent text emphasizes the importance of rubric calibration' },
    recent: recentItem,
    dormant: dormantItem
  }),
  null,
  'a slot written as a standalone sentence is rejected'
);
assert.strictEqual(
  applyRelationGates({
    parsed: { ...goodProposal, olderHolds: 'This piece argues that rubrics decay' },
    recent: recentItem,
    dormant: dormantItem
  }),
  null,
  'both slots must be verb phrases, not sentences'
);
assert.ok(
  applyRelationGates({
    parsed: { ...goodProposal, newerDoes: 'narrows that to the specific case of judge drift' },
    recent: recentItem,
    dormant: dormantItem
  }),
  'a verb-phrase slot passes'
);
// A describing verb produces a slot that would read identically if the older
// text did not exist — a summary wearing a verb phrase's clothes.
['emphasizes the importance of rubric calibration',
 'highlights the role of judge drift in scoring',
 'discusses how grading systems lose calibration'].forEach(slot => {
  assert.strictEqual(
    applyRelationGates({ parsed: { ...goodProposal, newerDoes: slot }, recent: recentItem, dormant: dormantItem }),
    null,
    `describing verb rejected: ${slot}`
  );
});
// The A slot may legitimately describe — it is stating what the older text holds.
assert.ok(
  applyRelationGates({
    parsed: { ...goodProposal, olderHolds: 'discusses rubric decay without a mechanism' },
    recent: recentItem,
    dormant: dormantItem
  }),
  'the A slot is allowed to describe; only B must act'
);
assert.strictEqual(applyRelationGates({ parsed: null, recent: recentItem, dormant: dormantItem }), null);
assert.strictEqual(
  applyRelationGates({ parsed: goodProposal, recent: recentItem, dormant: dormantItem, allowedRelations: ['contradicts'] }),
  null,
  'a relation outside the mechanic\'s allowed set is rejected'
);

// A relation is asymmetric. A slot announcing symmetry describes an
// association, which is the failure mode this whole design exists to exclude.
assert.strictEqual(
  applyRelationGates({
    parsed: { ...goodProposal, newerDoes: 'both texts emphasize the importance of rubrics' },
    recent: recentItem,
    dormant: dormantItem
  }),
  null,
  'a card that can only say the two things are similar does not render'
);
// Template placeholder text is not a relation, whichever slot it lands in.
assert.strictEqual(
  applyRelationGates({ parsed: { ...goodProposal, newerDoes: 'does Y to the older claim' }, recent: recentItem, dormant: dormantItem }),
  null,
  'placeholder slot text is rejected'
);

// A slot that repeats a quote back says nothing — the quote is already on the
// card directly above it.
assert.strictEqual(
  applyRelationGates({
    parsed: { ...goodProposal, newerDoes: 'restates that rubrics decay, but the mechanism was never clear to us, at length' },
    recent: recentItem,
    dormant: dormantItem
  }),
  null,
  'a composed line that echoes a quote does not count as a relation'
);

const longSlots = applyRelationGates({
  parsed: { ...goodProposal, newerDoes: `names ${'the cause '.repeat(40)}` },
  recent: recentItem,
  dormant: dormantItem
});
assert.ok(longSlots.lines[0].length <= 320, 'the composed line is clamped to the display budget');

/* ------------------------------------------------------------------ *
 * runRelationPass wiring — gates apply to real model output.
 * ------------------------------------------------------------------ */

const stubChat = (payload) => async () => ({ text: typeof payload === 'string' ? payload : JSON.stringify(payload), model: 'stub-model' });
const configured = () => true;

(async () => {
  const passed = await runRelationPass({
    recent: recentItem,
    dormant: dormantItem,
    deps: { chatComplete: stubChat(goodProposal), isTextGenerationConfigured: configured }
  });
  assert.ok(passed, 'a valid model response produces a relation');
  assert.strictEqual(passed.model, 'stub-model');

  const fabricated = await runRelationPass({
    recent: recentItem,
    dormant: dormantItem,
    deps: {
      chatComplete: stubChat({ ...goodProposal, recentQuote: 'Something the article never said at all' }),
      isTextGenerationConfigured: configured
    }
  });
  assert.strictEqual(fabricated, null, 'the gate rejects fabricated evidence end to end');

  const refused = await runRelationPass({
    recent: recentItem,
    dormant: dormantItem,
    deps: { chatComplete: stubChat({ relation: null }), isTextGenerationConfigured: configured }
  });
  assert.strictEqual(refused, null, 'the model is allowed to decline');

  const unconfigured = await runRelationPass({
    recent: recentItem,
    dormant: dormantItem,
    deps: { chatComplete: stubChat(goodProposal), isTextGenerationConfigured: () => false }
  });
  assert.strictEqual(unconfigured, null, 'no text generation configured means no card, not a broken card');

  const threw = await runRelationPass({
    recent: recentItem,
    dormant: dormantItem,
    deps: { chatComplete: async () => { throw new Error('upstream down'); }, isTextGenerationConfigured: configured }
  });
  assert.strictEqual(threw, null, 'an upstream failure is silence, not an exception');

  /* ---------------------------------------------------------------- *
   * Empty vs broken. These produced an identical calm page until the
   * diagnostics existed — the same defect that let two vector stores die
   * unnoticed in production.
   * ---------------------------------------------------------------- */

  const diagRun = async (chatImpl, configuredImpl = configured) => {
    const diag = __testables.newRelationDiagnostics();
    await runRelationPass({
      recent: recentItem,
      dormant: dormantItem,
      deps: { chatComplete: chatImpl, isTextGenerationConfigured: configuredImpl },
      diagnostics: diag
    });
    return diag;
  };

  // Retrieval failures come first: "the model was never asked" is true and
  // useless. Production returned a calm empty page while the same data on a
  // laptop returned four good hits, and none of the model diagnostics could
  // say so because the model was never reached.
  const searchFailed = __testables.newRelationDiagnostics();
  searchFailed.retrievalCalls = 2; searchFailed.retrievalErrors = 2; searchFailed.retrievalError = 'connection reset';
  const searchFailedOutcome = __testables.outcomeFromDiagnostics(searchFailed, 'Nothing worth connecting this week.');
  assert.strictEqual(searchFailedOutcome.status, 'error', 'a failing search is a fault, not an empty week');
  assert.match(searchFailedOutcome.reason, /search over your library failed/);
  assert.match(searchFailedOutcome.reason, /connection reset/, 'the underlying error survives');

  const embedFailed = __testables.newRelationDiagnostics();
  embedFailed.embedErrors = 1; embedFailed.retrievalError = 'AI service timed out';
  const embedFailedOutcome = __testables.outcomeFromDiagnostics(embedFailed, 'Nothing worth connecting this week.');
  assert.strictEqual(embedFailedOutcome.status, 'error');
  assert.match(embedFailedOutcome.reason, /could not be turned into a query/);

  // Searched fine, index gave back nothing. On a populated index that is a
  // fault — and it is exactly what production did.
  const emptyIndex = __testables.newRelationDiagnostics();
  emptyIndex.retrievalCalls = 2; emptyIndex.rawHits = 0;
  const emptyIndexOutcome = __testables.outcomeFromDiagnostics(emptyIndex, 'Nothing worth connecting this week.');
  assert.strictEqual(emptyIndexOutcome.status, 'error', 'an index returning nothing at all is reported, not hidden');
  assert.match(emptyIndexOutcome.reason, /semantic index returned nothing/);
  assert.match(emptyIndexOutcome.reason, /check \/health/);

  // Hits came back but all outside the band. That is tuning, not a fault.
  const outOfBand = __testables.newRelationDiagnostics();
  outOfBand.retrievalCalls = 2; outOfBand.rawHits = 14; outOfBand.inBandHits = 0;
  const outOfBandOutcome = __testables.outcomeFromDiagnostics(outOfBand, 'Nothing worth connecting this week.');
  assert.strictEqual(outOfBandOutcome.status, 'empty', 'nothing close enough is an answer, not a fault');
  assert.match(outOfBandOutcome.reason, /14 nearby items were found/);

  // Retrieval succeeded and the model ran: model diagnostics take over.
  const bothRan = __testables.newRelationDiagnostics();
  bothRan.retrievalCalls = 2; bothRan.rawHits = 9; bothRan.inBandHits = 4; bothRan.attempted = 4; bothRan.declined = 4;
  const bothRanOutcome = __testables.outcomeFromDiagnostics(bothRan, 'Nothing worth connecting this week.');
  assert.strictEqual(bothRanOutcome.status, 'empty');
  assert.match(bothRanOutcome.reason, /Examined 4 pairs/, 'a healthy run still reports how much it looked at');

  const unconfiguredDiag = await diagRun(stubChat(goodProposal), () => false);
  assert.strictEqual(unconfiguredDiag.unconfigured, true);
  assert.strictEqual(unconfiguredDiag.attempted, 0, 'an unconfigured model is never attempted');
  const unconfiguredOutcome = __testables.outcomeFromDiagnostics(unconfiguredDiag, 'Nothing worth connecting this week.');
  assert.strictEqual(unconfiguredOutcome.status, 'error', 'no model configured is a fault, not an empty week');
  assert.match(unconfiguredOutcome.reason, /not configured/);
  assert.match(unconfiguredOutcome.reason, /it is unknown/);

  const upstreamDiag = await diagRun(async () => { throw new Error('upstream timed out after 30000ms'); });
  assert.strictEqual(upstreamDiag.upstreamErrors, 1);
  assert.strictEqual(upstreamDiag.attempted, 1);
  const upstreamOutcome = __testables.outcomeFromDiagnostics(upstreamDiag, 'Nothing worth connecting this week.');
  assert.strictEqual(upstreamOutcome.status, 'error', 'a model that never answered is a fault, not an empty week');
  assert.match(upstreamOutcome.reason, /did not answer/);
  assert.match(upstreamOutcome.reason, /timed out/, 'the underlying error is carried through, not swallowed');

  const declinedDiag = await diagRun(stubChat({ relation: null }));
  assert.strictEqual(declinedDiag.declined, 1);
  assert.strictEqual(declinedDiag.gated, 0, 'a model declining is a real answer, not a bad one');
  const declinedOutcome = __testables.outcomeFromDiagnostics(declinedDiag, 'Nothing worth connecting this week.');
  assert.strictEqual(declinedOutcome.status, 'empty', 'the model answering "no relation" is an honest empty');
  assert.match(declinedOutcome.reason, /Examined 1 pair/, 'the reader is told how much was looked at');
  assert.match(declinedOutcome.reason, /found no real relation/);

  const gatedDiag = await diagRun(stubChat({ ...goodProposal, recentQuote: 'a quote that appears nowhere in the source' }));
  assert.strictEqual(gatedDiag.gated, 1, 'a fabricated quote is the model answering badly, not declining');
  assert.strictEqual(gatedDiag.declined, 0);
  const gatedOutcome = __testables.outcomeFromDiagnostics(gatedDiag, 'Nothing worth connecting this week.');
  assert.strictEqual(gatedOutcome.status, 'empty');
  assert.match(gatedOutcome.reason, /did not survive the quality gates/);

  // Nothing to examine at all keeps the plain reason — no numbers to report.
  const untouched = __testables.outcomeFromDiagnostics(__testables.newRelationDiagnostics(), 'Nothing worth connecting this week.');
  assert.strictEqual(untouched.status, 'empty');
  assert.strictEqual(untouched.reason, 'Nothing worth connecting this week.');

  // Mixed outcomes must not be reported as a fault: the model did answer.
  const mixed = __testables.newRelationDiagnostics();
  mixed.attempted = 3; mixed.declined = 2; mixed.upstreamErrors = 1;
  const mixedOutcome = __testables.outcomeFromDiagnostics(mixed, 'Nothing worth connecting this week.');
  assert.strictEqual(mixedOutcome.status, 'empty', 'partial upstream failure is still an answer overall');
  assert.match(mixedOutcome.reason, /1 went unanswered/);

  /* ---------------------------------------------------------------- *
   * Dormancy — dormant, not merely old.
   * ---------------------------------------------------------------- */

  assert.strictEqual(isDormant({ engagedAt: daysAgo(200), now: NOW }), true);
  assert.strictEqual(
    isDormant({ engagedAt: daysAgo(3), now: NOW }),
    false,
    'engaged with last week is not a discovery, however old the row is'
  );
  assert.strictEqual(
    isDormant({ engagedAt: daysAgo(30), now: NOW }),
    false,
    'recent engagement is never dormant'
  );
  assert.strictEqual(isDormant({ engagedAt: null, now: NOW }), false);
  assert.ok(DORMANT_MIN_AGE_MS === 120 * DAY_MS && RECENT_WINDOW_MS === 30 * DAY_MS);

  // The signal that matters: an imported archive stamps every row with the
  // import date, so row age is meaningless and highlight dates are the truth.
  const importedYesterdayReadLongAgo = {
    createdAt: daysAgo(1),
    highlights: [{ text: 'marked long ago', createdAt: daysAgo(400) }, { text: 'also then', createdAt: daysAgo(380) }]
  };
  assert.strictEqual(
    lastEngagementAt(importedYesterdayReadLongAgo).toISOString(),
    daysAgo(380).toISOString(),
    'last engagement is the most recent highlight, not the import date'
  );
  assert.strictEqual(
    isDormant({ engagedAt: lastEngagementAt(importedYesterdayReadLongAgo), now: NOW }),
    true,
    'an archive imported yesterday but read two years ago is dormant material'
  );
  assert.strictEqual(
    lastEngagementAt({ createdAt: daysAgo(50), highlights: [] }).toISOString(),
    daysAgo(50).toISOString(),
    'with nothing marked, saving is the only signal available'
  );

  // Highlights are the user's attention; body text is the publisher's.
  const marked = engagementText({ title: 'A title', content: 'publisher body text', highlights: [{ text: 'the part he marked' }] });
  assert.ok(marked.includes('the part he marked'), 'what the user marked is what the model reads');
  assert.ok(!marked.includes('publisher body text'), 'body text is not mixed in when highlights exist');
  assert.ok(
    engagementText({ title: 'A title', content: 'publisher body text', highlights: [] }).includes('publisher body text'),
    'with nothing marked, the body is the fallback'
  );

  /* ---------------------------------------------------------------- *
   * Recent set collection.
   * ---------------------------------------------------------------- */

  const longText = 'A sufficiently long body of text about evaluation harnesses and rubric drift over time.';
  const buildQuery = (rows) => ({
    sort: () => buildQuery(rows),
    limit: () => buildQuery(rows),
    select: () => buildQuery(rows),
    lean: async () => rows
  });
  // Every article carries the same import date — the shape a Readwise or Notion
  // archive actually has. Only the highlight dates separate them.
  const importedAt = daysAgo(65);
  const recentArticles = [
    { _id: 'a1', title: 'Marked this month', content: `<p>${longText}</p>`, createdAt: importedAt, highlights: [{ _id: 'h1', text: longText, createdAt: daysAgo(6) }] },
    { _id: 'a2', title: 'Too short', content: 'tiny', createdAt: importedAt, highlights: [{ _id: 'h2', text: 'x', createdAt: daysAgo(4) }] }
  ];
  const recentModels = {
    Article: { find: () => buildQuery(recentArticles) },
    NotebookEntry: {
      find: () => buildQuery([{ _id: 'n1', title: 'A note', content: longText, createdAt: daysAgo(400), updatedAt: daysAgo(9) }])
    }
  };
  const recentSet = await collectRecentSet({ userId: 'u1', models: recentModels, now: NOW });
  const recentTypes = recentSet.map(item => `${item.type}:${item.id}`);
  assert.ok(recentTypes.includes('article:a1'), 'an article highlighted inside the window is recent');
  assert.ok(recentTypes.includes('notebook_entry:n1'), 'a note touched inside the window is recent');
  assert.ok(!recentTypes.includes('article:a2'), 'items with too little marked text are dropped');
  assert.ok(!recentSet.some(item => /<[a-z]/i.test(item.text)), 'HTML is stripped before the text reaches the model');
  assert.strictEqual(
    recentSet.find(item => item.id === 'a1').at.toISOString(),
    daysAgo(6).toISOString(),
    'the recent item is dated by when it was marked, not when it was imported'
  );

  /* ---------------------------------------------------------------- *
   * Candidate hydration applies dormancy against Mongo, not the index.
   * ---------------------------------------------------------------- */

  const hydrateModels = (doc) => ({
    Article: { findOne: () => ({ select: () => ({ lean: async () => doc }) }) }
  });
  const dormantHydrated = await hydrateCandidate({
    userId: 'u1',
    models: hydrateModels({ _id: 'd9', title: 'Old piece', content: longText, createdAt: importedAt, highlights: [{ _id: 'dh9', text: longText, createdAt: daysAgo(300) }] }),
    type: 'article',
    objectId: 'd9',
    now: NOW
  });
  assert.ok(dormantHydrated, 'an article imported recently but read long ago is dormant material');
  assert.strictEqual(dormantHydrated.type, 'article');
  assert.strictEqual(dormantHydrated.at.toISOString(), daysAgo(300).toISOString());

  const warmRejected = await hydrateCandidate({
    userId: 'u1',
    models: hydrateModels({ _id: 'd8', title: 'Recently revisited', content: longText, createdAt: daysAgo(500), highlights: [{ _id: 'dh8', text: longText, createdAt: daysAgo(5) }] }),
    type: 'article',
    objectId: 'd8',
    now: NOW
  });
  assert.strictEqual(warmRejected, null, 'an old article marked again last week is not a discovery');

  const viaHighlight = await hydrateCandidate({
    userId: 'u1',
    models: hydrateModels({ _id: 'd7', title: 'Reached through a highlight', content: longText, createdAt: importedAt, highlights: [{ _id: 'dh7', text: longText, createdAt: daysAgo(300) }] }),
    type: 'highlight',
    objectId: 'dh7',
    now: NOW
  });
  assert.strictEqual(viaHighlight.type, 'article', 'a highlight hit resolves to the article that holds it');
  assert.strictEqual(viaHighlight.id, 'd7');

  /* ---------------------------------------------------------------- *
   * Similarity band — a ceiling as well as a floor.
   * ---------------------------------------------------------------- */

  const band = similarityBand({});
  assert.ok(band.min > 0 && band.max < 1 && band.min < band.max);

  // Scores here are in ATLAS space — `(1 + cosine) / 2`. The raw-cosine band of
  // 0.45–0.90 is 0.725–0.95 once normalized, and using raw numbers here would
  // make the test pass while production silently returned nothing.
  const searchRows = [
    { score: 0.99, objectType: 'article', objectId: 'dup', metadata: {} },
    { score: 0.86, objectType: 'article', objectId: 'good', metadata: {} },
    { score: 0.55, objectType: 'article', objectId: 'unrelated', metadata: {} },
    { score: 0.88, objectType: 'article', objectId: 'self', metadata: {} }
  ];
  const matches = await findDormantMatches({
    userId: 'u1',
    models: {
      Article: {
        findOne: (query) => ({
          select: () => ({
            lean: async () => ({
              _id: String(query._id),
              title: `Doc ${query._id}`,
              content: longText,
              createdAt: daysAgo(300),
              lastOpenedAt: null
            })
          })
        })
      }
    },
    recentItem: { type: 'article', id: 'self', title: 'Seed', text: longText },
    now: NOW,
    env: {},
    deps: {
      embedText: async () => [0.1, 0.2, 0.3],
      searchVectorItems: async () => searchRows
    }
  });
  const matchedIds = matches.map(match => match.id);
  assert.ok(matchedIds.includes('good'), 'an in-band candidate survives');
  assert.ok(!matchedIds.includes('dup'), 'a near-duplicate above the ceiling is dropped');
  assert.ok(!matchedIds.includes('unrelated'), 'a candidate below the floor is dropped');
  assert.ok(!matchedIds.includes('self'), 'an item is never paired with itself');

  const embedFailure = await findDormantMatches({
    userId: 'u1',
    models: {},
    recentItem: { type: 'article', id: 'x', text: longText },
    now: NOW,
    deps: { embedText: async () => { throw new Error('embeddings down'); }, searchVectorItems: async () => [] }
  });
  assert.deepStrictEqual(embedFailure, [], 'an embedding outage degrades to no candidates');

  /* ---------------------------------------------------------------- *
   * Connection generation, end to end with stubs.
   * ---------------------------------------------------------------- */

  const connectionModels = {
    NotebookEntry: { find: () => buildQuery([]) },
    Article: {
      find: () => buildQuery([recentArticles[0]]),
      findOne: () => ({
        select: () => ({
          lean: async () => ({
            _id: 'd1',
            title: 'Measuring What Matters',
            content: dormantItem.text,
            createdAt: importedAt,
            highlights: [{ _id: 'dh1', text: dormantItem.text, createdAt: daysAgo(300) }]
          })
        })
      })
    }
  };
  const connectionDeps = {
    embedText: async () => [0.1, 0.2],
    searchVectorItems: async () => [{ score: 0.80, objectType: 'article', objectId: 'd1', metadata: {} }],
    isTextGenerationConfigured: configured,
    chatComplete: stubChat({
      relation: 'fills_gap',
      recentQuote: longText.slice(0, 60),
      olderQuote: 'Rubrics decay, but the mechanism was never clear to us',
      olderHolds: 'notes the decay without naming a cause',
      newerDoes: 'supplies the cause the older account was missing'
    })
  };
  const connection = await generateConnection({ userId: 'u1', models: connectionModels, now: NOW, env: {}, deps: connectionDeps });
  assert.strictEqual(connection.status, 'ready');
  assert.strictEqual(connection.card.kind, 'connection');
  assert.strictEqual(connection.card.recent.id, 'a1');
  assert.strictEqual(connection.card.dormant.id, 'd1');
  assert.ok(connection.card.pairKey);

  const alreadyShown = await generateConnection({
    userId: 'u1',
    models: connectionModels,
    now: NOW,
    env: {},
    deps: connectionDeps,
    edition: { history: [{ key: connection.card.pairKey, shownAt: NOW }] }
  });
  assert.strictEqual(alreadyShown.status, 'empty', 'a pair shown recently does not come back');

  const noReading = await generateConnection({
    userId: 'u1',
    models: { Article: { find: () => buildQuery([]) }, NotebookEntry: { find: () => buildQuery([]) } },
    now: NOW,
    env: {},
    deps: connectionDeps
  });
  assert.strictEqual(noReading.status, 'empty');
  assert.match(noReading.reason, /Nothing read this week/);

  /* ---------------------------------------------------------------- *
   * Claim candidates for collision — the two-source quality gate.
   * ---------------------------------------------------------------- */

  const claimText = 'Context windows large enough to hold a corpus make retrieval augmentation unnecessary for most applications.';
  const claims = await collectClaimCandidates({
    userId: 'u1',
    models: {
      WikiPage: {
        find: () => ({
          select: () => ({
            lean: async () => [{
              _id: 'p1',
              title: 'Retrieval',
              createdAt: daysAgo(300),
              claims: [
                { claimId: 'c1', text: claimText, sourceRefIds: ['s1', 's2'], createdAt: daysAgo(250) },
                { claimId: 'c2', text: claimText, sourceRefIds: ['s1'], createdAt: daysAgo(250) },
                { claimId: 'c3', text: claimText, sourceRefIds: ['s1', 's2'], checkInStatus: 'retired', createdAt: daysAgo(250) },
                { claimId: 'c4', text: 'Too short', sourceRefIds: ['s1', 's2'], createdAt: daysAgo(250) },
                { claimId: 'c5', text: claimText, sourceRefIds: ['s1', 's2'], createdAt: daysAgo(3) },
                { claimId: 'c6', text: 'The recurring pattern across these sources is that the useful claim is narrower than the topic label.', sourceRefIds: ['s1', 's2'], createdAt: daysAgo(250) }
              ]
            }]
          })
        })
      }
    },
    now: NOW
  });
  assert.deepStrictEqual(
    claims.map(claim => claim.claimId),
    ['c1'],
    'thin, retired, stub, just-written, and maintenance-meta claims are all excluded'
  );
  assert.strictEqual(claims[0].sourceCount, 2);

  /* ---------------------------------------------------------------- *
   * Unnamed thread — real counts, no vague labels, wiki-aware.
   * ---------------------------------------------------------------- */

  const threadBody = 'evaluation harness rubric drift judging models scoring reliability benchmarks';
  const threadRows = [1, 2, 3, 4, 5].map(index => ({
    _id: `t${index}`,
    title: `Thread source ${index}`,
    content: threadBody,
    createdAt: importedAt,
    highlights: [{ _id: `th${index}`, text: threadBody, createdAt: daysAgo(index + 1) }]
  }));
  const threadModels = {
    Article: { find: () => buildQuery(threadRows) },
    NotebookEntry: { find: () => buildQuery([]) },
    WikiPage: { find: () => ({ select: () => ({ lean: async () => [] }) }) }
  };
  const thread = await generateThread({
    userId: 'u1',
    models: threadModels,
    now: NOW,
    env: {},
    deps: {
      embedText: async () => [0.1],
      isTextGenerationConfigured: configured,
      chatComplete: stubChat({ name: 'Eval harness reliability', line: 'How grading systems lose their calibration.' })
    }
  });
  assert.strictEqual(thread.status, 'ready');
  assert.strictEqual(thread.card.name, 'Eval harness reliability');
  assert.ok(thread.card.sources.length >= 4, 'a thread names every source behind its count');
  assert.ok(thread.card.sources.every(source => source.title && source.href), 'every source is nameable and clickable');

  const vagueThread = await generateThread({
    userId: 'u1',
    models: threadModels,
    now: NOW,
    env: {},
    deps: {
      embedText: async () => [0.1],
      isTextGenerationConfigured: configured,
      chatComplete: stubChat({ name: null })
    }
  });
  assert.strictEqual(vagueThread.status, 'empty', 'the model declining to name a thread is a supported outcome');

  const alreadyCovered = await generateThread({
    userId: 'u1',
    models: {
      ...threadModels,
      WikiPage: { find: () => ({ select: () => ({ lean: async () => [{ title: 'Eval harness reliability' }] }) }) }
    },
    now: NOW,
    env: {},
    deps: {
      embedText: async () => [0.1],
      isTextGenerationConfigured: configured,
      chatComplete: stubChat({ name: 'Eval harness reliability', line: 'Already covered by a page.' })
    }
  });
  assert.strictEqual(alreadyCovered.status, 'empty', 'a thread the wiki already covers is not unnamed');

  const tooFew = await generateThread({
    userId: 'u1',
    models: { Article: { find: () => buildQuery(threadRows.slice(0, 2)) }, NotebookEntry: { find: () => buildQuery([]) }, WikiPage: { find: () => ({ select: () => ({ lean: async () => [] }) }) } },
    now: NOW,
    env: {},
    deps: { embedText: async () => [0.1], isTextGenerationConfigured: configured, chatComplete: stubChat({ name: 'x', line: 'y' }) }
  });
  assert.strictEqual(tooFew.status, 'empty', 'fewer than four items is not a thread');

  console.log('readingLoopService tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});

/* ------------------------------------------------------------------ *
 * Ledgers, caps, serialization — synchronous checks.
 * ------------------------------------------------------------------ */

assert.strictEqual(pairKey({ type: 'article', id: 'a' }, { type: 'article', id: 'b' }), pairKey({ type: 'article', id: 'b' }, { type: 'article', id: 'a' }), 'pair identity is order-independent');

const ledgerEdition = {
  history: [
    { kind: 'connection', key: 'fresh', shownAt: daysAgo(3) },
    { kind: 'connection', key: 'expired', shownAt: daysAgo(90) }
  ],
  suppressed: [
    { kind: 'thread', key: 'live', until: new Date(NOW.getTime() + DAY_MS) },
    { kind: 'thread', key: 'lapsed', until: daysAgo(1) }
  ],
  runCounts: [{ kind: 'collision', localDate: NOW.toISOString().slice(0, 10), count: 2 }]
};

assert.strictEqual(isRecentlyShown(ledgerEdition, 'fresh', NOW), true);
assert.strictEqual(isRecentlyShown(ledgerEdition, 'expired', NOW), false, 'the no-repeat window expires');
assert.strictEqual(isSuppressed(ledgerEdition, 'thread', 'live', NOW), true);
assert.strictEqual(isSuppressed(ledgerEdition, 'thread', 'lapsed', NOW), false, 'a dismissal expires rather than being permanent');
assert.strictEqual(runsUsedToday(ledgerEdition, 'collision', NOW), 2);
assert.strictEqual(runsUsedToday(ledgerEdition, 'resolution', NOW), 0);

pruneLedgers(ledgerEdition, NOW);
assert.deepStrictEqual(ledgerEdition.history.map(row => row.key), ['fresh']);
assert.deepStrictEqual(ledgerEdition.suppressed.map(row => row.key), ['live']);

const serialized = serializeMechanic({ status: 'ready', card: { kind: 'connection' }, generatedAt: NOW }, 'connection', ledgerEdition, NOW, {});
assert.strictEqual(serialized.kind, 'connection');
assert.strictEqual(serialized.status, 'ready');
assert.strictEqual(serialized.generatedAt, NOW.toISOString());
assert.ok(serialized.dailyRunCap >= 1);

const emptyMechanic = serializeMechanic(undefined, 'thread', ledgerEdition, NOW, {});
assert.strictEqual(emptyMechanic.status, 'idle');
assert.strictEqual(emptyMechanic.card, null);

assert.deepStrictEqual(safeJsonParse('{"a":1}'), { a: 1 });
assert.deepStrictEqual(safeJsonParse('noise before {"a":1} noise after'), { a: 1 }, 'a fenced or chatty response still parses');
assert.strictEqual(safeJsonParse('not json at all'), null);
assert.strictEqual(safeJsonParse(''), null);

const card = cardFromRelation({ kind: 'connection', recent: recentItem, dormant: dormantItem, relation: gated, now: NOW });
assert.strictEqual(card.recent.quote, gated.recentQuote);
assert.strictEqual(card.dormant.quote, gated.dormantQuote);
assert.strictEqual(card.dormant.at, dormantItem.at.toISOString());
assert.strictEqual(card.relationLabel, 'fills a gap in');
