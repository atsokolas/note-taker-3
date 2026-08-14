const assert = require('assert');
const { __testables } = require('./wikiMaintenanceService');

const { perSourceTextBudget, applySourceTextBudget } = __testables;

// The rule: no page gets less source text than it did before this budget existed.
// Pages with few sources get more, up to a cap, so a single source that *is* the
// page can actually be written from.
const FLOOR = 1800;
const CAP = 12000;

// A single source used to be cut to 1800 characters — 4% of a 45,636-character
// article — and the model filled the rest from its own knowledge, which the
// evidence gate then correctly rejected.
assert.strictEqual(perSourceTextBudget(1), CAP);
assert.strictEqual(perSourceTextBudget(2), 12000);
assert.strictEqual(perSourceTextBudget(4), 6000);
assert.strictEqual(perSourceTextBudget(8), 3000);

// Never below the old flat value, however many sources there are.
assert.strictEqual(perSourceTextBudget(24), FLOOR);
assert.strictEqual(perSourceTextBudget(100), FLOOR);
assert.ok(perSourceTextBudget(1000) >= FLOOR);

// Degenerate inputs must not produce a zero or negative window.
[0, -3, null, undefined, NaN, 'nonsense'].forEach((value) => {
  assert.ok(perSourceTextBudget(value) >= FLOOR, `budget for ${String(value)} must not fall below the floor`);
});

// The budget trims text, never invents or drops candidates.
// truncate() replaces the tail with an ellipsis, so the result can run a couple of
// characters past the limit. Allow for that rather than pretending it is exact.
const ELLIPSIS_SLACK = 3;
const long = 'x'.repeat(40000);
const single = applySourceTextBudget([{ title: 'A', text: long }]);
assert.strictEqual(single.length, 1);
assert.ok(single[0].text.length <= CAP + ELLIPSIS_SLACK);
assert.strictEqual(single[0].title, 'A');

const four = applySourceTextBudget([1, 2, 3, 4].map(n => ({ title: `S${n}`, text: long })));
assert.strictEqual(four.length, 4);
four.forEach(candidate => assert.ok(candidate.text.length <= 6000 + ELLIPSIS_SLACK));

// Short sources are left exactly as they are.
const short = applySourceTextBudget([{ title: 'short', text: 'brief' }]);
assert.strictEqual(short[0].text, 'brief');

// Candidates without text survive untouched.
const untouched = applySourceTextBudget([{ title: 'no text' }, null]);
assert.strictEqual(untouched.length, 2);
assert.strictEqual(untouched[0].title, 'no text');

assert.deepStrictEqual(applySourceTextBudget(), []);
assert.deepStrictEqual(applySourceTextBudget(null), []);

console.log('wiki source text budget tests passed');
