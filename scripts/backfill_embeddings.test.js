const assert = require('node:assert');
const {
  DEFAULT_TYPES,
  selectedPassageCleanupPlan
} = require('./backfill_embeddings');

assert.ok(!DEFAULT_TYPES.includes('article-passages'), 'passage backfill stays opt-in');

const all = [
  { objectType: 'article', objectId: 'a1', subId: 'passage:v1:0' },
  { objectType: 'article', objectId: 'a1', subId: 'passage:v1:1' },
  { objectType: 'article', objectId: 'a2', subId: 'passage:v1:0' }
];
const limited = selectedPassageCleanupPlan(all, [all[0]]);
assert.deepStrictEqual([...limited.keys()], ['a1'], 'a limited run cleans only an article represented in its queue slice');
assert.deepStrictEqual(limited.get('a1').subIds, ['passage:v1:0', 'passage:v1:1'], 'cleanup preserves every current passage for that article');
assert.strictEqual(limited.has('a2'), false, 'unselected articles remain untouched');
assert.strictEqual(selectedPassageCleanupPlan(all, []).size, 0, 'an empty slice deletes nothing');

const fullPassageState = new Map([
  ['a1', { subIds: ['passage:v1:0', 'passage:v1:1'], updatedAt: '2026-08-30T10:00:00.000Z', sourceContentHash: 'source-a1' }],
  ['short-now', { subIds: [], updatedAt: '2026-08-30T11:00:00.000Z', sourceContentHash: 'source-short' }]
]);
const full = selectedPassageCleanupPlan(all, all, {
  passageStateByArticle: fullPassageState,
  includeAllArticles: true
});
assert.deepStrictEqual(full.get('short-now').subIds, [], 'a full opt-in run cleans passages left by an article that is now too short');

console.log('backfill_embeddings tests passed');
