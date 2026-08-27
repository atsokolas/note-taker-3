const assert = require('assert');
const { normalizeThreadScope } = require('./agentThreadState');

['question', 'wiki_page', 'think'].forEach((type) => {
  assert.deepStrictEqual(
    normalizeThreadScope({ type, id: 'exact-id', title: 'Exact title' }),
    { type, id: 'exact-id', title: 'Exact title', metadata: {} },
    `${type} should retain its exact room identity`
  );
});

assert.deepStrictEqual(
  normalizeThreadScope({ type: 'invented', id: 'x' }),
  { type: 'global', id: 'x', title: '', metadata: {} },
  'unknown scope types should fail closed to global'
);

console.log('agentThreadState scope tests passed');
