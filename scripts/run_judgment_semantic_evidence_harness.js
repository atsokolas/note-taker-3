#!/usr/bin/env node

/*
 * Offline acceptance for semantic Judgment discovery.
 *
 * Scores are labelled fixtures, not the output of a live model. This proves
 * the product boundary without spending credits: only high-confidence owned
 * highlight identities are hydrated, the displayed words are the exact saved
 * passage, topic distractors stay out, and stance remains undecided.
 */

const assert = require('node:assert');
const {
  findSemanticHighlightEvidence,
  SEMANTIC_ATLAS_SCORE_FLOOR
} = require('../server/services/judgmentEvidenceService');

const scenarios = [
  ['parenting', 'Predictable evening rituals help young children sleep more soundly.', 'A stable bedtime sequence was associated with fewer night wakings among preschool children.'],
  ['product', 'Removing setup steps helps new customers reach value sooner.', 'Teams reached their first successful workflow faster when configuration was deferred until after activation.'],
  ['hiring', 'The first infrastructure hire should be able to own reliability alone.', 'The strongest early platform candidate had independently operated production systems and incident response.'],
  ['machine-learning', 'Adversarial debate can make reward gaming less attractive to models.', 'Models trained with opposing critiques exploited the evaluator less often on held-out tasks.'],
  ['investing', 'Membership economics can sustain unusually durable customer retention.', 'Renewals remained resilient because the annual fee was small relative to the savings members received.'],
  ['education', 'Frequent recall strengthens durable learning better than rereading.', 'Students tested from memory retained more of the material a month later than students who reviewed it again.'],
  ['engineering', 'Shipping smaller changes should shorten recovery from failures.', 'Incidents caused by narrow releases were isolated and reversed more quickly than incidents from bundled launches.'],
  ['health', 'Light movement after eating can moderate glucose excursions.', 'A brief walk immediately following meals produced a smaller postprandial rise in the monitored cohort.']
].map(([name, claim, passage]) => ({ name, claim, passage }));

const run = async () => {
  let vectorSearches = 0;
  for (const scenario of scenarios) {
    const articleId = `${scenario.name}:article`;
    const highlightId = `${scenario.name}:relevant`;
    const distractorId = `${scenario.name}:distractor`;
    const Article = {
      find: () => {
        const query = {
          limit: () => query,
          maxTimeMS: () => query,
          lean: async () => [{
            _id: articleId,
            title: `${scenario.name} source`,
            url: `https://example.test/${scenario.name}`,
            highlights: [
              { _id: highlightId, text: scenario.passage },
              { _id: distractorId, text: 'A nearby topic with no claim-level relationship.' }
            ]
          }]
        };
        return query;
      }
    };
    const candidates = await findSemanticHighlightEvidence({
      Article,
      VectorItem: { available: true },
      userId: 'owned-account',
      pageId: `${scenario.name}:page`,
      claim: scenario.claim,
      similar: async () => {
        vectorSearches += 1;
        return [
          {
            objectType: 'highlight', objectId: highlightId,
            metadata: { articleId }, score: SEMANTIC_ATLAS_SCORE_FLOOR + 0.02
          },
          {
            objectType: 'highlight', objectId: distractorId,
            metadata: { articleId }, score: SEMANTIC_ATLAS_SCORE_FLOOR - 0.02
          }
        ];
      }
    });

    assert.strictEqual(candidates.length, 1, `${scenario.name}: distractor crossed the semantic floor`);
    assert.strictEqual(candidates[0].text, scenario.passage, `${scenario.name}: visible text is not the saved passage`);
    assert.strictEqual(candidates[0].highlightId, highlightId, `${scenario.name}: highlight identity was lost`);
    assert.strictEqual(candidates[0].side, undefined, `${scenario.name}: retrieval guessed stance`);
  }

  console.log(JSON.stringify({
    verdict: 'PASS',
    scenarios: scenarios.length,
    relevantPassagesRecovered: scenarios.length,
    topicOnlyDistractorsReturned: 0,
    vectorSearches,
    embeddingCalls: 0,
    generativeModelCalls: 0,
    stanceInference: 'NOT CLAIMED — human disposition preserved'
  }, null, 2));
};

run().catch((error) => { console.error(error); process.exit(1); });
