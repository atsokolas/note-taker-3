const assert = require('assert');
const {
  evaluateCheckInEligibility,
  isBeliefShaped,
  isJudgmentSurface,
  isFirstPersonOwnable,
  isNaturalBeliefFrame,
  EXHIBIT_A,
  REPO_WIKI_CLAIM_CORPUS
} = require('./checkInEligibility');
const { selectDailyClaimCheckIn } = require('./dailyLoopService');

const NOW = new Date('2026-08-29T12:00:00Z').getTime();

const heldBelief = {
  claimId: 'ai-compute',
  text: 'AI compute is going through orders of magnitude change.',
  support: 'partial',
  sourceRefIds: ['s1'],
  checkInStatus: 'reaffirmed',
  lastCheckedAt: '2026-07-01T12:00:00Z',
  createdAt: '2026-01-01T12:00:00Z',
  history: [{ actorType: 'user', action: 'reaffirmed' }]
};

const judgmentPage = {
  _id: 'thesis-1',
  title: 'AI compute thesis',
  pageType: 'concept',
  lastVisitedAt: '2026-08-28',
  judgment: { kind: 'thesis', currentJudgment: 'Compute keeps compounding.' },
  claims: [heldBelief]
};

assert.strictEqual(isBeliefShaped(heldBelief.text), true);
assert.strictEqual(isNaturalBeliefFrame(heldBelief.text), true);
assert.strictEqual(isJudgmentSurface(judgmentPage), true);
assert.strictEqual(isFirstPersonOwnable(heldBelief), true);

assert.strictEqual(isBeliefShaped(EXHIBIT_A), false, 'Exhibit A is not a belief');
assert.strictEqual(isNaturalBeliefFrame(EXHIBIT_A), false);

const exhibitA = evaluateCheckInEligibility({
  page: {
    _id: 'repo-wiki',
    title: 'note-taker-3 — repo wiki',
    pageType: 'repo'
  },
  claim: {
    claimId: 'exhibit-a',
    text: EXHIBIT_A,
    checkInStatus: 'unreviewed',
    history: [{ actorType: 'agent' }]
  },
  now: NOW
});
assert.strictEqual(exhibitA.eligible, false);
assert.ok(exhibitA.reasons.includes('not_belief_shaped'));
assert.ok(exhibitA.reasons.includes('not_judgment_surface'));
assert.ok(exhibitA.reasons.includes('too_long'));
assert.ok(exhibitA.reasons.includes('not_ownable'));

const eligible = evaluateCheckInEligibility({
  page: judgmentPage,
  claim: heldBelief,
  now: NOW
});
assert.strictEqual(eligible.eligible, true, eligible.reasons.join(','));

const selected = selectDailyClaimCheckIn({
  pages: [judgmentPage],
  watcherLeads: [],
  now: NOW
});
assert.ok(selected);
assert.strictEqual(selected.claimId, 'ai-compute');
assert.strictEqual(selected.text, heldBelief.text);
assert.ok(!selected.text.includes('…'));

const repoResults = REPO_WIKI_CLAIM_CORPUS.map((row) => evaluateCheckInEligibility({
  ...row,
  now: NOW
}));
assert.ok(repoResults.every((row) => row.eligible === false));
assert.ok(repoResults[0].reasons.includes('not_belief_shaped'));
assert.ok(repoResults[0].reasons.includes('not_judgment_surface'));
assert.ok(repoResults[0].reasons.includes('too_long'));
assert.ok(repoResults[0].reasons.includes('not_ownable'));

const noneFromCorpus = selectDailyClaimCheckIn({
  pages: REPO_WIKI_CLAIM_CORPUS.map((row) => ({
    ...row.page,
    claims: [row.claim]
  })),
  watcherLeads: [],
  now: NOW
});
assert.strictEqual(noneFromCorpus, null);

const longBelief = {
  ...heldBelief,
  claimId: 'long',
  text: 'I believe the next decade of AI will be decided by who can convert energy into useful tokens at the lowest cost while keeping the resulting systems aligned with human judgment over long horizons, preserving durable institutional memory, and remaining accountable to the people affected by those systems.'
};
assert.strictEqual(evaluateCheckInEligibility({
  page: judgmentPage,
  claim: longBelief,
  now: NOW
}).eligible, false);

const unowned = evaluateCheckInEligibility({
  page: judgmentPage,
  claim: {
    ...heldBelief,
    checkInStatus: 'unreviewed',
    history: [{ actorType: 'agent', summary: 'Extracted.' }]
  },
  now: NOW
});
assert.strictEqual(unowned.eligible, false);
assert.ok(unowned.reasons.includes('not_ownable'));

const recentlyShown = evaluateCheckInEligibility({
  page: judgmentPage,
  claim: { ...heldBelief, lastCheckedAt: '2026-08-20T12:00:00Z' },
  now: NOW
});
assert.strictEqual(recentlyShown.eligible, false);
assert.ok(recentlyShown.reasons.includes('shown_within_14_days'));

const silence = selectDailyClaimCheckIn({
  pages: [{
    ...judgmentPage,
    claims: [{
      ...heldBelief,
      text: 'Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries.',
      checkInStatus: 'unreviewed',
      history: []
    }]
  }],
  now: NOW
});
assert.strictEqual(silence, null);

/*
 * The gate must rest on structure, not on remembering one bad sentence.
 * These are process notes nobody has ever observed — the gate has no phrase
 * of theirs memorised, so it can only reject them for what they are.
 */
const UNSEEN_PROCESS_NOTES = [
  'Run the seed script first so the fixture user exists before the harness starts.',
  'Open the workspace route and confirm the pane identity survives a reload.',
  'Update CHANGELOG before tagging, otherwise the release job rejects the build.'
];
UNSEEN_PROCESS_NOTES.forEach((text) => {
  assert.strictEqual(
    isBeliefShaped(text),
    false,
    `unseen process note should fail the belief gate: ${text}`
  );
});

/* A belief the gate has never seen must still survive it. */
const UNSEEN_BELIEFS = [
  'Concentration only pays inside a circle of competence you have actually earned.',
  'The market underprices durability because durability is boring to underwrite.'
];
UNSEEN_BELIEFS.forEach((text) => {
  assert.strictEqual(isBeliefShaped(text), true, `unseen belief should pass: ${text}`);
});

/* Exhibit A must fail for reasons that outlive it. */
const exhibit = evaluateCheckInEligibility({
  page: { pageType: 'repo', title: 'note-taker-3 — repo wiki' },
  claim: { text: EXHIBIT_A, checkInStatus: 'unreviewed', history: [] }
});
assert.strictEqual(exhibit.eligible, false);
assert.ok(exhibit.reasons.length >= 3, 'Exhibit A should fail several independent gates, not one');

console.log('checkInEligibility tests passed');
