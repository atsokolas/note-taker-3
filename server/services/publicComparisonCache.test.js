const assert = require('assert');
const { createPublicComparisonCache } = require('./publicComparisonCache');

let now = 1000;
const cache = createPublicComparisonCache({ ttlMs: 2000, maxEntries: 2, now: () => now });

cache.set('Repo-A', { comparison: { version: 1 } });
assert.deepStrictEqual(cache.get('repo-a'), { comparison: { version: 1 } });
now = 3000;
assert.strictEqual(cache.get('repo-a'), null);

cache.set('a', { value: 'a' });
cache.set('b', { value: 'b' });
assert.deepStrictEqual(cache.get('a'), { value: 'a' });
cache.set('c', { value: 'c' });
assert.strictEqual(cache.get('b'), null);
assert.deepStrictEqual(cache.get('a'), { value: 'a' });
assert.deepStrictEqual(cache.get('c'), { value: 'c' });
assert.strictEqual(cache.size(), 2);

cache.set('', { value: 'ignored' });
cache.set('missing-value', null);
assert.strictEqual(cache.size(), 2);

console.log('publicComparisonCache tests passed');
