const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInitialSourceRefs } = require('./wikiSourceRefs');

test('a page made from twelve kept passages cites all twelve', () => {
  const refs = Array.from({ length: 12 }, (_, n) => ({ type: 'highlight', objectId: String(n + 1).padStart(24, '0'), title: 'Seven Powers', snippet: `Passage ${n + 1}` }));
  const { value, error } = normalizeInitialSourceRefs({ initialSourceRefs: refs, createdFrom: { type: 'highlight' } });
  assert.equal(error, undefined);
  assert.equal(value.length, 12);
});
