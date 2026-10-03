const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createGateway, validatePublicOrigin } = require('./noeis_chatgpt_test_gateway.cjs');
const start = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
const stop = server => new Promise(resolve => server.close(resolve));

test('temporary gateway exact origin, allowlist, body bounds and consent block', async () => {
  for (const invalid of ['http://test.trycloudflare.com', 'https://example.com', 'https://test.trycloudflare.com/', 'https://u:p@test.trycloudflare.com', 'https://test.trycloudflare.com/path', 'https://test.trycloudflare.com?x=1']) assert.throws(() => validatePublicOrigin(invalid));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-gateway-test-'));
  fs.mkdirSync(path.join(directory, 'static'));
  fs.writeFileSync(path.join(directory, 'index.html'), '<html>Disposable gateway fixture</html>');
  fs.writeFileSync(path.join(directory, 'static/main.js'), 'console.log("fixture");');
  fs.writeFileSync(path.join(directory, 'asset-manifest.json'), JSON.stringify({ files: { main: '/static/main.js' } }));
  const received = [];
  const heldResponses = [];
  let reachedConcurrentLimit;
  const upstream = await start(http.createServer((req, res) => {
    received.push({ path: req.url, method: req.method, headers: req.headers });
    req.resume();
    req.on('end', () => {
      if (req.url.endsWith('?hold=1')) {
        heldResponses.push(res);
        if (heldResponses.length === 20) reachedConcurrentLimit();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', 'must-not-forward=fixture; Domain=production.example');
      res.end(JSON.stringify({ fixture: true }));
    });
  }));
  let time = 0;
  const gateway = await start(createGateway({ publicOrigin: 'https://test.trycloudflare.com', apiOrigin: `http://127.0.0.1:${upstream.address().port}`, buildDir: directory, now: () => time }));
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const call = (route, { method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const request = http.request(base + route, { method, headers: { Host: 'test.trycloudflare.com', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: { get: name => response.headers[name] || null }, text: async () => Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject); request.end(body);
  });
  try {
    assert.equal((await call('/.well-known/oauth-authorization-server')).status, 200);
    assert.equal((await call('/login')).status, 200);
    assert.equal((await call('/settings/connected-agents/chatgpt?request=metadata-only')).status, 200);
    assert.equal((await call('/static/main.js')).status, 200);
    const context = '/api/chatgpt/oauth/requests/metadata_request_1234';
    assert.equal((await call(context)).status, 401);
    const read = await call(context, { headers: { Authorization: 'Bearer fixture', Cookie: 'session=blocked', 'X-Forwarded-Host': 'production.example' } });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('set-cookie'), null);
    assert.equal(received.at(-1).headers.authorization, 'Bearer fixture');
    assert.equal(received.at(-1).headers.cookie, undefined);
    assert.equal(received.at(-1).headers['x-forwarded-host'], undefined);
    assert.equal(received.at(-1).headers.host, `127.0.0.1:${upstream.address().port}`);
    assert.equal((await call('/mcp', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer fixture' } })).status, 200);
    const challenged = await call('/mcp', { method: 'POST', body: '{}' });
    assert.equal(challenged.status, 401);
    assert.equal(challenged.headers.get('www-authenticate'), 'Bearer resource_metadata="https://test.trycloudflare.com/.well-known/oauth-protected-resource", scope="read"');
    assert.equal((await call('/mcp')).status, 405);
    assert.equal((await call('/mcp', { method: 'OPTIONS' })).status, 200);
    for (const route of ['/api/auth/register', '/api/agent-tokens', context + '/consent', '/api/wiki/pages', '/articles/a/highlights/h/thoughts', '/debug/seed']) {
      const count = received.length;
      assert.equal((await call(route, { method: 'POST', body: '{}', headers: { Authorization: 'Bearer fixture' } })).status, 403);
      assert.equal(received.length, count);
    }
    assert.equal((await call('/unknown-spa')).status, 403);
    assert.equal((await call('/static/main.js.map')).status, 403);
    assert.equal((await call('/.well-known/oauth-authorization-server', { headers: { Host: 'attacker.example' } })).status, 421);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: '{}', headers: { Origin: 'https://production.example' } })).status, 403);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: '{}', headers: { Origin: 'https://test.trycloudflare.com' } })).status, 200);
    assert.equal((await call('/oauth/chatgpt/token', { method: 'POST', body: 'x'.repeat(8193) })).status, 413);
    const before = received.length;
    for (let i = 0; i < 5; i++) await call('/api/auth/login', { method: 'POST', body: '{}' });
    assert.equal(received.length - before, 4);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: '{}' })).status, 429);
    time = 60001;
    assert.equal((await call('/api/auth/login', { method: 'POST', body: '{}' })).status, 200);
    const twentyReady = new Promise(resolve => { reachedConcurrentLimit = resolve; });
    const pending = Array.from({ length: 20 }, () => call('/oauth/chatgpt/authorize?hold=1'));
    await twentyReady;
    assert.equal((await call('/.well-known/oauth-authorization-server')).status, 429);
    for (const response of heldResponses) response.end('{}');
    await Promise.all(pending);
    // Enabling consent exposes one exact request only, never an arbitrary
    // grant API. The upstream still validates the human JWT and single-use request.
    assert.throws(() => createGateway({ publicOrigin: 'https://test.trycloudflare.com', buildDir: directory, allowConsent: true }), /exact approved request/);
    const decisionGateway = await start(createGateway({ publicOrigin: 'https://test.trycloudflare.com', apiOrigin: `http://127.0.0.1:${upstream.address().port}`, buildDir: directory, allowConsent: true, approvedConsentRequestId: 'metadata_request_1234' }));
    const decisionCall = (route, headers = {}, body = '{"approved":true}') => new Promise((resolve, reject) => {
      const request = http.request(`http://127.0.0.1:${decisionGateway.address().port}${route}`, { method: 'POST', headers: { Host: 'test.trycloudflare.com', 'Content-Type': 'application/json', ...headers } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject); request.end(body);
    });
    try {
      const route = context + '/consent';
      const approvedHeaders = { Authorization: 'Bearer fixture', Origin: 'https://test.trycloudflare.com' };
      assert.equal(await decisionCall(route, approvedHeaders), 200);
      const beforeDenied = received.length;
      assert.equal(await decisionCall(route, { Origin: 'https://test.trycloudflare.com' }), 401);
      assert.equal(await decisionCall(route, { Authorization: 'Bearer fixture' }), 403);
      assert.equal(await decisionCall(route, { ...approvedHeaders, Origin: 'https://attacker.example' }), 403);
      assert.equal(await decisionCall('/api/chatgpt/oauth/requests/another_request_1234/consent', approvedHeaders), 403);
      assert.equal(await decisionCall('/api/agent-tokens', approvedHeaders), 403);
      assert.equal(await decisionCall('/api/auth/register', approvedHeaders), 403);
      assert.equal(await decisionCall(route, approvedHeaders, '{"approved":true,"scopes":["agent-write"]}'), 400);
      assert.equal(received.length, beforeDenied);
    } finally { await stop(decisionGateway); }
    time = 30 * 60000 + 1;
    assert.equal((await call('/.well-known/oauth-authorization-server')).status, 410);
  } finally {
    await stop(gateway); await stop(upstream); fs.rmSync(directory, { recursive: true, force: true });
  }
});
