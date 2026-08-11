const assert = require('assert');
const { requireAuthenticatedUser, parseOptionalClaimId } = require('./conceptRouteGuards');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

for (const user of [undefined, null, {}, { id: '' }, { id: '   ' }]) {
  const res = response();
  let called = false;
  requireAuthenticatedUser({ user }, res, () => { called = true; });
  assert.strictEqual(called, false);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.code, 'AUTH_REQUIRED');
}

{
  const res = response();
  let called = false;
  requireAuthenticatedUser({ user: { id: ' user-1 ' } }, res, () => { called = true; });
  assert.strictEqual(called, true);
  assert.strictEqual(res.body, null);
}

assert.deepStrictEqual(parseOptionalClaimId(undefined), { value: '' });
assert.deepStrictEqual(parseOptionalClaimId(null), { value: '' });
assert.deepStrictEqual(parseOptionalClaimId(' claim-1 '), { value: 'claim-1' });
for (const value of ['', '   ']) assert.match(parseOptionalClaimId(value).error, /must not be empty/i);
for (const value of [[], {}, 1, true]) assert.match(parseOptionalClaimId(value).error, /must be a string/i);
assert.match(parseOptionalClaimId('x'.repeat(241)).error, /too long/i);

console.log('concept route guards tests passed');
