const assert = require('assert');
const { __testables } = require('../conceptAgentService');

const {
  buildLocalFallbackPlan,
  isTransientSemanticUpstreamError,
  scoreTextAgainstKeywords,
  diversifyCandidateItems,
  buildKeywordList
} = __testables;

const run = async () => {
  assert.strictEqual(isTransientSemanticUpstreamError({ status: 429 }), true, '429 should be treated as transient.');
  assert.strictEqual(isTransientSemanticUpstreamError({ status: 400 }), false, '400 should not be treated as transient.');
  assert.strictEqual(isTransientSemanticUpstreamError({ message: 'rate-limit challenge page' }), true, 'Rate limit message should be transient.');

  const keywords = buildKeywordList({
    title: 'Insights',
    description: 'How people build reliable insights from evidence'
  });
  assert.ok(keywords.length > 0, 'Keyword list should not be empty for valid concept text.');

  const strongScore = scoreTextAgainstKeywords('Insights from evidence and reliable methods.', keywords, 0);
  const weakScore = scoreTextAgainstKeywords('Completely unrelated sentence.', keywords, 0);
  assert.ok(strongScore > 0, 'Relevant text should score above zero.');
  assert.strictEqual(weakScore, 0, 'Irrelevant text should score zero.');

  const diversified = diversifyCandidateItems([
    { type: 'article', id: 'a1', source: 'https://example.com/a', score: 0.9 },
    { type: 'article', id: 'a2', source: 'https://example.com/b', score: 0.85 },
    { type: 'article', id: 'a3', source: 'https://example.com/c', score: 0.8 },
    { type: 'article', id: 'a4', source: 'https://example.com/d', score: 0.75 },
    { type: 'article', id: 'a5', source: 'https://example.com/e', score: 0.7 }
  ], { maxPerSource: 2, maxTotal: 10 });
  assert.ok(diversified.length <= 2, 'Diversification should limit same-source items.');

  const fallbackPlan = buildLocalFallbackPlan({
    conceptTitle: 'Insights',
    conceptDescription: 'How to synthesize evidence into insight.',
    initialQueries: ['Insights', 'Insights overview'],
    candidateItems: [
      { type: 'article', id: 'a1', title: 'Source A', text: 'Insight methods', source: 'https://a.com', score: 0.91 },
      { type: 'highlight', id: 'h1', title: 'Source A', text: 'Key quote', source: 'https://a.com', score: 0.87 }
    ]
  });

  assert.ok(Array.isArray(fallbackPlan.groups) && fallbackPlan.groups.length >= 3, 'Fallback plan should include group structure.');
  assert.ok(Array.isArray(fallbackPlan.outline) && fallbackPlan.outline.length >= 5, 'Fallback plan should include outline.');
  assert.ok(Array.isArray(fallbackPlan.open_questions) && fallbackPlan.open_questions.length >= 5, 'Fallback plan should include open questions.');
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('conceptAgentService agent-flow tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
