const assert = require('assert');
const { serializePublicCasebook } = require('./judgmentPublicProjection');

/**
 * Stage 4 adversarial isolation.
 *
 * The gate is "zero private-field leaks", and the only honest way to test that
 * is to stop guessing which fields a projection might forward. Every private
 * value below is a unique nonsense token. The output is flattened to a single
 * string - keys and values, at every depth - and searched for all of them at
 * once. A leak through a field nobody thought to check still fails.
 *
 * The projection is an allowlist today, which is why this passes. The point of
 * the test is the day someone changes that: a projection built by naming what
 * is public cannot leak a new field, and a projection built by deleting what
 * is private leaks every field added after it was written. This test is what
 * notices which of those two the code has become.
 */

const POISON = {
  privateNote: 'POISONnote7a',
  portfolioWeight: 'POISONweight7b',
  conviction: 'POISONconviction7c',
  unpublishedCandidate: 'POISONcandidate7d',
  agentState: 'POISONagent7e',
  ownerLabel: 'POISONowner7f',
  strongestCounter: 'POISONcounter7g',
  assumption: 'POISONassumption7h',
  unknown: 'POISONunknown7i',
  dependency: 'POISONdependency7j',
  dismissedEvent: 'POISONdismissed7k',
  lessonApplication: 'POISONlesson7l',
  causalSummary: 'POISONcausal7m',
  posture: 'POISONposture7n',
  trigger: 'POISONtrigger7o'
};

const PUBLIC_CLAIM = 'Costco membership economics survive a consumer downturn.';

const loadedPage = () => ({
  _id: 'page-1',
  title: 'Costco',
  slug: 'costco',
  userId: 'user-1',
  // Agent state and private notes live beside the judgment on the page.
  aiState: {
    draftStatus: POISON.agentState,
    maintenanceSummary: POISON.agentState,
    changeLog: [{ type: 'note', text: POISON.privateNote, title: POISON.privateNote }]
  },
  privateNotes: POISON.privateNote,
  portfolio: { weight: POISON.portfolioWeight, weights: { COST: POISON.portfolioWeight } },
  sourceRefs: [
    { type: 'external', title: 'Costco FY25 10-K', url: 'https://example.com/10k', snippet: 'Renewals held.' }
  ],
  judgment: {
    currentJudgment: PUBLIC_CLAIM,
    bornAt: '2025-09-01T00:00:00.000Z',
    // Conviction, in every form the schema offers.
    confidence: 0.87,
    convictionNote: POISON.conviction,
    decisionPosture: POISON.posture,
    ownerLabel: POISON.ownerLabel,
    strongestCounterargument: POISON.strongestCounter,
    nextReviewTrigger: POISON.trigger,
    causalModel: { summary: POISON.causalSummary, nodes: [POISON.causalSummary], edges: [] },
    assumptions: [{ assumptionId: 'a1', text: POISON.assumption }],
    unknowns: [{ unknownId: 'u1', text: POISON.unknown }],
    dependsOn: [{ pageId: 'page-2', note: POISON.dependency }],
    lessonApplications: [
      { applicationId: 'ap1', lessonId: 'l1', status: 'rejected', sourceText: POISON.lessonApplication }
    ],
    dismissedOvernightEventIds: [POISON.dismissedEvent],
    // An unpublished candidate must never travel.
    why: [{ reasonId: 'w1', text: 'Renewals held above ninety percent.', sourceLabel: 'Costco FY25 10-K' }],
    against: [{ reasonId: 'g1', text: POISON.unpublishedCandidate, reviewState: 'candidate' }],
    clocks: [],
    verdicts: [],
    outcomes: [],
    resolutionCriteria: 'Renewal rate falls below 88% for two consecutive years.'
  }
});

/** Keys and values, at every depth, as one searchable string. */
const flatten = (value, out = []) => {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) { value.forEach(item => flatten(item, out)); return out; }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => { out.push(String(key)); flatten(item, out); });
    return out;
  }
  out.push(String(value));
  return out;
};

{
  const folio = serializePublicCasebook({ page: loadedPage() });

  // A projection that returns nothing leaks nothing, and proves nothing.
  assert.ok(folio, 'the casebook projects at all');
  assert.equal(folio.claim.text, PUBLIC_CLAIM, 'the held claim is public, and is what a reader came for');
  assert.ok(folio.evidence.length > 0, 'cited evidence travels with the claim');
  assert.ok(folio.criterion.includes('Renewal rate'), 'the resolution criterion is public by design');

  const haystack = flatten(folio).join(' ').toLowerCase();
  const leaked = Object.entries(POISON)
    .filter(([, token]) => haystack.includes(token.toLowerCase()))
    .map(([name]) => name);

  assert.deepStrictEqual(leaked, [], `private fields reached the public casebook: ${leaked.join(', ')}`);

  // Conviction is a number, so it has no token of its own. Assert its absence
  // directly rather than trusting that a stray 0.87 would have been noticed.
  assert.ok(!('confidence' in folio), 'confidence is not a public field');
  assert.ok(!haystack.includes('0.87'), 'the confidence value does not travel under another name');
}

/* A held claim is the price of admission: a page without one publishes nothing
   at all, rather than publishing an empty shell that looks maintained. */
{
  const bare = loadedPage();
  bare.judgment.currentJudgment = '   ';
  assert.equal(serializePublicCasebook({ page: bare }), null);
}

console.log('public casebook leak tests passed');
