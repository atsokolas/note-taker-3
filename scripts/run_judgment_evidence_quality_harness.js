#!/usr/bin/env node

/*
 * Offline acceptance for the Judgment evidence selector.
 *
 * This spends no model credits and touches no database. Each scenario is
 * hand-labelled across a different kind of decision. Passing means the exact
 * support and counterpassage survive the selector, topic-only distractors do
 * not, and the quoted words themselves carry the match. It does not claim
 * that lexical retrieval can infer stance; the agent and the reader still do
 * that semantic work.
 */

const assert = require('node:assert');
const {
  claimTerms,
  candidatesFromArticle,
  rankCandidates
} = require('../server/services/judgmentEvidenceService');

const scenarios = [
  {
    name: 'parenting',
    claim: 'Consistent bedtime routines improve children sleep quality.',
    support: 'Consistent bedtime routines improved sleep quality for children throughout the school week.',
    counter: 'Consistent bedtime routines did not improve children sleep quality in the controlled trial.',
    distractor: 'Bedtime stories helped children learn new vocabulary.'
  },
  {
    name: 'product',
    claim: 'Shorter onboarding improves activation for new customers.',
    support: 'Shorter onboarding improved activation for new customers by removing two setup steps.',
    counter: 'Shorter onboarding did not improve activation for new customers who still needed guidance.',
    distractor: 'The onboarding team interviewed customers about the new color palette.'
  },
  {
    name: 'hiring',
    claim: 'Maya should be the first engineer hired for infrastructure.',
    support: 'Maya should be the first engineer hired because she already owns the critical infrastructure systems.',
    counter: 'Maya should not be the first infrastructure engineer hired while the product role remains unfilled.',
    distractor: 'Maya and the first engineer met for lunch after the interview.'
  },
  {
    name: 'machine-learning',
    claim: 'Debate training reduces reward hacking in language models.',
    support: 'Debate training reduced reward hacking in language models under adversarial evaluation.',
    counter: 'Debate training did not reduce reward hacking in language models outside the benchmark.',
    distractor: 'The language training workshop debated model documentation.'
  },
  {
    name: 'investing',
    claim: 'Costco membership renewal can remain above ninety percent.',
    support: 'Costco membership renewal remained above ninety percent during the reported period.',
    counter: 'Costco membership renewal may fall below ninety percent as household budgets tighten.',
    distractor: 'Costco expanded a membership desk at a new warehouse.'
  },
  {
    name: 'education',
    claim: 'Daily retrieval practice improves long term student retention.',
    support: 'Daily retrieval practice improved long term retention for students in the course.',
    counter: 'Daily retrieval practice did not improve long term student retention after the semester ended.',
    distractor: 'Students practiced the daily opening routine before class.'
  },
  {
    name: 'engineering',
    claim: 'Smaller deployment batches reduce recovery time after failures.',
    support: 'Smaller deployment batches reduced recovery time after production failures.',
    counter: 'Smaller deployment batches did not reduce recovery time when database failures occurred.',
    distractor: 'The deployment checklist uses smaller type for optional steps.'
  },
  {
    name: 'health',
    claim: 'Walking after meals reduces post meal glucose spikes.',
    support: 'Walking after meals reduced post meal glucose spikes in the monitored group.',
    counter: 'Walking after meals did not reduce post meal glucose spikes for insulin dependent participants.',
    distractor: 'The walking group shared meals after the weekly meeting.'
  }
];

const article = (scenario, role) => ({
  _id: `${scenario.name}:${role}`,
  title: `${scenario.name} ${role}`,
  url: `https://example.test/${scenario.name}/${role}`,
  highlights: [{
    _id: `${scenario.name}:${role}:highlight`,
    text: scenario[role]
  }]
});

const results = scenarios.map((scenario) => {
  const terms = claimTerms(scenario.claim);
  const rows = ['support', 'counter', 'distractor']
    .flatMap(role => candidatesFromArticle(article(scenario, role), terms));
  const ranked = rankCandidates(rows, 4);
  const ids = ranked.map(candidate => candidate.articleId);
  const expected = [`${scenario.name}:support`, `${scenario.name}:counter`];

  expected.forEach((id) => assert.ok(ids.includes(id), `${scenario.name}: missing ${id}`));
  assert.ok(!ids.includes(`${scenario.name}:distractor`), `${scenario.name}: topic-only distractor survived`);
  ranked.forEach((candidate) => {
    assert.ok(candidate.text, `${scenario.name}: candidate has no visible quotation`);
    assert.ok(candidate.whyThisSource, `${scenario.name}: candidate does not explain its eligibility`);
    assert.ok(candidate.articleId && candidate.highlightId && candidate.url, `${scenario.name}: provenance is incomplete`);
  });

  return {
    name: scenario.name,
    passed: true,
    returned: ids,
    expected
  };
});

const silenceTerms = claimTerms('Urban tree canopy lowers neighborhood summer temperatures.');
const silence = rankCandidates(candidatesFromArticle({
  _id: 'silence:distractor',
  title: 'Neighborhood notes',
  url: 'https://example.test/silence',
  highlights: [{ _id: 'silence:h1', text: 'The neighborhood association planted flowers in spring.' }]
}, silenceTerms), 4);
assert.deepStrictEqual(silence, [], 'an unrelated library stays honestly silent');

const summary = {
  verdict: 'PASS',
  modelCalls: 0,
  scenarios: results.length,
  relevantPassagesExpected: results.length * 2,
  relevantPassagesRecovered: results.length * 2,
  topicOnlyDistractorsReturned: 0,
  silenceFallback: 'PASS',
  stanceInference: 'NOT CLAIMED — agent plus human boundary preserved'
};

console.log(JSON.stringify(summary, null, 2));

