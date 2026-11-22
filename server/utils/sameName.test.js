const test = require('node:test');
const assert = require('node:assert/strict');
const { sameName } = require('./sameName');

test('a name is matched as written, never read as a pattern', () => {
  assert.equal(sameName('C++').test('c++'), true);
  assert.equal(sameName('.*').test('Hiring'), false);
  assert.equal(sameName('(a+)+$').test('aaaa'), false);
  assert.equal(sameName('Base rates').test('base rates'), true);
});
