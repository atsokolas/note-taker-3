const test = require('node:test');
const assert = require('assert');
const { judgeClaims, summarizeVerdicts, passagesFor } = require('./judge');

const filing = `${'Cover page and risk factors. '.repeat(60)}Revenue for the first quarter was $81.6 billion, up 85% from a year ago. ${'Legal proceedings. '.repeat(60)}`;

test('the judge reads the stretch of a source that looks like the claim', () => {
  const [best] = passagesFor('Q1 revenue was $81.6 billion, up 85%.', filing, 1);
  assert.match(best, /81\.6 billion, up 85%/);
});

test('each claim gets its own verdict; uncited and unread claims are not asked about', async () => {
  const asked = [];
  const chat = async ({ messages }) => {
    asked.push(messages[1].content);
    return { text: '{"verdicts":[{"id":1,"verdict":"supported","reason":"Stated."},{"id":2,"verdict":"unsupported","reason":"Not in the passage."}]}' };
  };
  const verdicts = await judgeClaims({
    chat,
    sources: [filing, ''],
    claims: [
      { text: 'Q1 revenue was $81.6 billion.', citationIndexes: [1] },
      { text: 'Q1 revenue was $90 billion.', citationIndexes: [1] },
      { text: 'Margins will rise.', citationIndexes: [] },
      { text: 'Customers renewed.', citationIndexes: [2] }
    ]
  });
  assert.deepStrictEqual(verdicts.map(item => item.verdict), ['supported', 'unsupported', 'uncited', 'unread']);
  assert.strictEqual(asked.length, 1);
  assert.doesNotMatch(asked[0], /Margins will rise/);
  assert.deepStrictEqual(summarizeVerdicts(verdicts), { supported: 1, partial: 0, unsupported: 1, uncited: 1, unread: 1, unjudged: 0, supportedShare: 0.5 });
});

test('a judge that does not answer leaves claims unjudged rather than passed', async () => {
  const verdicts = await judgeClaims({
    chat: async () => ({ text: 'I cannot help with that.' }),
    sources: [filing],
    claims: [{ text: 'Q1 revenue was $81.6 billion.', citationIndexes: [1] }]
  });
  assert.strictEqual(verdicts[0].verdict, 'unjudged');
});
