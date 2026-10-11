const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { buildOpenaiAppsChallengeRouter } = require('../openaiAppsChallengeRoutes');

test('ownership proof is exact public plain text without an account or OAuth grant', async (t) => {
  const app = express();
  app.use(buildOpenaiAppsChallengeRouter());
  app.use((_req, res) => res.sendStatus(404));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${base}/.well-known/openai-apps-challenge`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/plain(?:;|$)/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.text();
  assert.equal(body, '98gBRFdqZEaZGR_4eCEu69N0LCHZyXnqxG1guKsWBP4');
  assert.equal(Buffer.byteLength(body), 43);

  const otherPath = await fetch(`${base}/.well-known/another-challenge`);
  assert.equal(otherPath.status, 404);
  const unsupportedMethod = await fetch(`${base}/.well-known/openai-apps-challenge`, { method: 'POST' });
  assert.equal(unsupportedMethod.status, 404);
});
