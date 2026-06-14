const assert = require('assert');
const {
  composeCruftSuppressionNotice,
  countSuppressedInCollection,
  filterReturnViewItems,
  isSuppressedFromReturnView,
  matchesCruftHeuristic
} = require('../cruftSuppression');

assert.strictEqual(isSuppressedFromReturnView({ title: 'Good thread', hiddenFromHome: true }), true);
assert.strictEqual(isSuppressedFromReturnView({ title: 'Good thread', debugOnly: true }), true);
assert.strictEqual(isSuppressedFromReturnView({ title: 'Good thread', archived: true }), true);
assert.strictEqual(isSuppressedFromReturnView({ title: 'Good thread', status: 'archived' }), true);

assert.strictEqual(matchesCruftHeuristic('TEMP MCP RETEST 2026-06-06'), true);
assert.strictEqual(matchesCruftHeuristic('Blah'), true);
assert.strictEqual(matchesCruftHeuristic('TEST (8)'), true);
assert.strictEqual(matchesCruftHeuristic('investing'), false);

const mixed = [
  { title: 'investing' },
  { title: 'Blah' },
  { title: 'Test', hiddenFromHome: true },
  { title: 'Playing to Win' }
];
assert.strictEqual(countSuppressedInCollection(mixed), 2);
assert.deepStrictEqual(
  filterReturnViewItems(mixed).map((item) => item.title),
  ['investing', 'Playing to Win']
);

assert.strictEqual(
  composeCruftSuppressionNotice(7),
  '7 low-signal test items were kept out of your return view.'
);
assert.strictEqual(
  composeCruftSuppressionNotice(1),
  '1 low-signal test item was kept out of your return view.'
);
assert.strictEqual(composeCruftSuppressionNotice(0), '');

console.log('cruftSuppression.test.js: ok');
