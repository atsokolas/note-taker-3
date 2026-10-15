const test = require('node:test');
const assert = require('assert');
const { scorePage, claimsOf } = require('./score');
const { figuresIn } = require('../services/agentGrounding');

const claim = (text, citationIndexes, claimId = text.slice(0, 12)) => ({
  type: 'text',
  text,
  marks: [{ type: 'claim', attrs: { claimId, support: 'supported', citationIndexes } }]
});
const page = paragraphs => ({
  title: 'NVIDIA',
  sourceRefs: [{ title: '10-K' }, { title: '10-Q' }],
  body: { type: 'doc', content: paragraphs.map(content => ({ type: 'paragraph', content })) }
});

const tenK = 'Revenue $ 215,938 130,497 ... Gross margin 71.1 % 75.0 % ... Net income 120,067';
const tenQ = 'Revenue for the first quarter was $81.6 billion, up 85% from a year ago.';

test('a figure counts only when the source it cites states it, at any scale', () => {
  const scored = scorePage({
    page: page([
      [claim('FY2026 revenue was $215.938 billion and gross margin 71.1%.', [1])],
      [claim('Q1 revenue was $81.6 billion, up 85%.', [2]), ' Which matters.'],
      [claim('Free cash flow was $96.676 billion.', [1])],
      [claim('Inventory was $25.8 billion.', [])]
    ]),
    sources: [tenK, tenQ]
  });
  assert.strictEqual(scored.figures.total, 6);
  assert.strictEqual(scored.figures.checkable, 5);
  assert.strictEqual(scored.figures.statedShare, 4 / 5);
  assert.deepStrictEqual(scored.figures.notStated.map(item => item.figure), ['$96.676 billion']);
  assert.strictEqual(scored.figures.uncited, 1);
  assert.strictEqual(scored.citedShare, 3 / 4);
  assert.strictEqual(scored.sourcesCited, 2);
});

test('years and small counts are not figures; precision decides what matches', () => {
  assert.deepStrictEqual(figuresIn('In 2026 three of 5 customers paid 21% and $4.5B').map(item => item.raw), ['21%', '$4.5B']);
  const scored = scorePage({ page: page([[claim('Margin was 71.13%.', [1])]]), sources: [tenK] });
  assert.strictEqual(scored.figures.statedShare, 0);
});

test('uncited paragraphs, dangling citations, invented quotes and app vocabulary are counted', () => {
  const scored = scorePage({
    page: page([
      [{ type: 'text', text: 'This paragraph makes a claim with no source behind it at all.' }],
      [claim('The CEO said "we will ship twice as many systems next year" in May.', [3])],
      [claim('Push 6 added the market value as part of the backtest.', [1])]
    ]),
    sources: [tenK, tenQ],
    dates: { latestCited: '2026-06-18', latestAvailable: '2026-08-26' }
  });
  assert.strictEqual(scored.claims, 3);
  assert.strictEqual(scored.danglingCitations, 1);
  assert.deepStrictEqual(scored.inventedQuotes, ['we will ship twice as many systems next year']);
  assert.deepStrictEqual(scored.leaks, ['push 6', 'backtest']);
  assert.strictEqual(scored.daysBehindLatestFiling, 69);
});

test('one claim mark across several text runs is one claim', () => {
  const marks = [{ type: 'claim', attrs: { claimId: 'c1', citationIndexes: [1] } }];
  const claims = claimsOf({ type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'Revenue grew ', marks },
    { type: 'text', text: 'quickly', marks: [...marks, { type: 'bold' }] },
    { type: 'text', text: '.', marks }
  ] }] });
  assert.deepStrictEqual(claims.map(item => item.text), ['Revenue grew quickly.']);
});
