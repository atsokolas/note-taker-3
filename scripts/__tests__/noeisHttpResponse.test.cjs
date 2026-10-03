const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readNoeisHttpResponse } = require('../lib/noeisHttpResponse.cjs');
test('revocation plain OK remains successful and permits follow-up denial check', async () => {
  assert.deepEqual(await readNoeisHttpResponse(new Response('OK', { status: 200 })), { status: 200, body: 'OK' });
});
test('token JSON and non-JSON failures retain their HTTP status', async () => {
  assert.deepEqual(await readNoeisHttpResponse(new Response('{"error":"invalid_grant"}', { status: 400 })), { status: 400, body: { error: 'invalid_grant' } });
  assert.deepEqual(await readNoeisHttpResponse(new Response('Service unavailable', { status: 503 })), { status: 503, body: 'Service unavailable' });
});
test('empty successful revocation is accepted without losing status', async () => {
  assert.deepEqual(await readNoeisHttpResponse(new Response(null, { status: 204 })), { status: 204, body: '' });
});
