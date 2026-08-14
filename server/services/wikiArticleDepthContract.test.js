const assert = require('assert');
const {
  evaluateWikiArticleQuality,
  __testables: { buildPrompt, ordinaryArticleMinimumWords, docFromArticle }
} = require('./wikiMaintenanceService');

// The writer and the reviewer used to disagree about depth: the gate derived a
// floor from the evidence, the prompt said only "do not force a target length".
// Articles landed near 500 words against a 650 floor and were rejected for a
// standard nobody had stated. These tests pin that both sides read one number.

const candidate = (index, words) => ({
  index,
  type: 'article',
  objectId: `source-${index}`,
  title: `Capital allocation source ${index}`,
  text: Array.from({ length: words }, () => 'capital').join(' ')
});

const run = () => {
  // 1. The floor tracks the evidence, and is capped.
  assert.equal(ordinaryArticleMinimumWords({ sourceCount: 4, evidenceWordCount: 9000 }), 450,
    'fewer than five sources uses the flat floor');
  assert.equal(ordinaryArticleMinimumWords({ sourceCount: 5, evidenceWordCount: 100 }), 450,
    'thin evidence never drops below the flat floor');
  assert.equal(ordinaryArticleMinimumWords({ sourceCount: 5, evidenceWordCount: 400 }), 500,
    'the floor scales with the evidence supplied');
  assert.equal(ordinaryArticleMinimumWords({ sourceCount: 5, evidenceWordCount: 100000 }), 650,
    'the floor is capped so a large corpus cannot demand an essay');

  // 2. The number the prompt states is the number the gate applies.
  const candidates = [1, 2, 3, 4, 5].map(index => candidate(index, 120));
  const page = { title: 'Capital allocation', pageType: 'concept' };
  const prompt = buildPrompt({ page, candidates });
  const promptFloor = Number(prompt.match(/reviewed against a floor of (\d+) words/)?.[1]);
  assert.ok(Number.isFinite(promptFloor), 'the prompt must state a floor');

  const sourceRefs = candidates.map(source => ({
    type: 'article',
    objectId: source.objectId,
    title: source.title,
    snippet: source.text
  }));
  const quality = evaluateWikiArticleQuality({
    page,
    body: docFromArticle({
      title: page.title,
      article: { summary: { text: 'Too short.', citationIndexes: [1] }, sections: [] }
    }),
    claims: [],
    sourceRefs,
    skipDurableCitationCheck: true
  });
  const gateFloor = Number(
    quality.failures
      .map(failure => failure.match(/too thin for \d+ available sources: \d+ words, expected at least (\d+)/)?.[1])
      .find(Boolean)
  );
  assert.ok(Number.isFinite(gateFloor), 'a thin article must report the floor it missed');
  assert.equal(promptFloor, gateFloor,
    `prompt floor ${promptFloor} must equal gate floor ${gateFloor}`);

  // 3. Stating a floor must not become permission to pad.
  assert.ok(/Reaching it by padding fails/.test(prompt),
    'the prompt must rule out reaching the floor with filler');

  console.log('wikiArticleDepthContract tests passed');
};

if (require.main === module) {
  try { run(); } catch (error) { console.error(error); process.exit(1); }
}

module.exports = { run };
