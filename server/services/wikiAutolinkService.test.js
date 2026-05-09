const assert = require('assert');
const { findAutolinkSuggestions, __testables } = require('./wikiAutolinkService');

const { buildTitleMatcher, scanTextForCandidate, truncate } = __testables;

const fakeModel = (records) => ({
  find: () => ({
    sort: () => ({
      limit: () => ({
        lean: () => Promise.resolve(records)
      })
    })
  })
});

const run = async () => {
  assert.strictEqual(buildTitleMatcher('AI'), null);
  assert.strictEqual(buildTitleMatcher(' '), null);
  assert.ok('I love what Karpathy said.'.match(buildTitleMatcher('Karpathy')));
  assert.strictEqual('karpathylike is not a word.'.match(buildTitleMatcher('Karpathy')), null);

  assert.strictEqual(scanTextForCandidate({ targetText: 'no match', candidateTitle: 'Compounding' }), null);
  const scan = scanTextForCandidate({
    targetText: 'Notes about Compounding interest. Compounding interest scales over time.',
    candidateTitle: 'Compounding interest'
  });
  assert.strictEqual(scan.mentionCount, 2);
  assert.match(scan.snippet, /Compounding interest/);

  assert.match(truncate('a'.repeat(80), 30), /^a+…$/);
  assert.strictEqual(truncate('short'), 'short');

  const noText = await findAutolinkSuggestions({
    targetPage: { _id: 'target', plainText: '' },
    userId: 'u1',
    models: { WikiPage: fakeModel([{ _id: 'a', title: 'Compounding interest' }]) }
  });
  assert.deepStrictEqual(noText, { suggestions: [], scanned: 0 });

  const targetPage = {
    _id: 'target',
    title: 'Strategy',
    plainText: 'This page references Compounding interest a lot. Compounding interest is a frequent topic. Karpathy also matters.'
  };
  const ranked = await findAutolinkSuggestions({
    targetPage,
    userId: 'u1',
    models: {
      WikiPage: fakeModel([
        { _id: 'a', title: 'Compounding interest' },
        { _id: 'b', title: 'Karpathy' },
        { _id: 'c', title: 'Unrelated topic' }
      ])
    }
  });
  assert.deepStrictEqual(ranked.suggestions.map(suggestion => suggestion.pageId), ['a', 'b']);
  assert.strictEqual(ranked.suggestions[0].mentionCount, 2);
  assert.strictEqual(ranked.suggestions[1].mentionCount, 1);
  assert.strictEqual(ranked.scanned, 3);

  const tied = await findAutolinkSuggestions({
    targetPage: { _id: 'target', plainText: 'Alpha concept and Beta concept are mentioned once each.' },
    userId: 'u1',
    models: {
      WikiPage: fakeModel([
        { _id: 'b', title: 'Beta concept' },
        { _id: 'a', title: 'Alpha concept' }
      ])
    }
  });
  assert.deepStrictEqual(tied.suggestions.map(suggestion => suggestion.title), ['Alpha concept', 'Beta concept']);

  const titles = Array.from({ length: 14 }, (_value, index) => `Topic number ${index}`);
  const capped = await findAutolinkSuggestions({
    targetPage: { _id: 'target', plainText: titles.map(title => `${title} matters here.`).join(' ') },
    userId: 'u1',
    models: { WikiPage: fakeModel(titles.map((title, index) => ({ _id: `p${index}`, title }))) }
  });
  assert.strictEqual(capped.suggestions.length, __testables.MAX_SUGGESTIONS);
  assert.strictEqual(capped.scanned, 14);

  const selfOnly = await findAutolinkSuggestions({
    targetPage: { _id: 'target', title: 'Strategy', plainText: 'Strategy is the topic.' },
    userId: 'u1',
    models: { WikiPage: fakeModel([]) }
  });
  assert.deepStrictEqual(selfOnly.suggestions, []);
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('wikiAutolinkService tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
