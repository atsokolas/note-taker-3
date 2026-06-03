const assert = require('assert');
const { buildConnectionScopeQuery } = require('../connectionScopeQuery');

assert.deepStrictEqual(buildConnectionScopeQuery({}), {}, 'empty scope returns all connections for an item');
assert.deepStrictEqual(
  buildConnectionScopeQuery({ scopeType: 'concept', scopeId: 'abc' }),
  { scopeType: 'concept', scopeId: 'abc' },
  'explicit scope filters to that workspace'
);

console.log('connectionScopeQuery.test.js: ok');
