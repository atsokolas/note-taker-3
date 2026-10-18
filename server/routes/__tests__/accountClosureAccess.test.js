const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const { buildAuthDiscoveryRouter } = require('../authDiscoveryRoutes');
const { buildImportRouter } = require('../importRoutes');
const { encryptSecret } = require('../../utils/integrationSecrets');
const id = '111111111111111111111111';
const listen = app => new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })); });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('disabled account cannot sign in even when its credential would otherwise match', async () => {
  let compared = false; let signed = false;
  const app = express(); app.use(express.json());
  app.use(buildAuthDiscoveryRouter({ User: { findOne: async () => ({ _id: id, accountDisabledAt: new Date() }) }, bcrypt: { compare: async () => { compared = true; return true; } }, jwt: { sign: () => { signed = true; } }, authenticateToken: () => {}, Recommendation: {}, Article: {} }));
  const { server, base } = await listen(app);
  try {
    const result = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'synthetic-disabled', password: 'unusable-synthetic-value' }) });
    assert.equal(result.status, 401); assert.equal(compared, false); assert.equal(signed, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('actual personal-agent and bridge middleware distinguish healthy, inactive and unavailable accounts', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
  const personalSource = source.slice(source.indexOf('async function authenticatePersonalAgentKey'), source.indexOf('async function authenticateAgentBridgeToken'));
  const bridgeSource = source.slice(source.indexOf('async function authenticateAgentBridgeToken'), source.indexOf('const slugify ='));
  let saved = false; let availability = 'inactive'; let logged = false;
  const context = { isAccountActive: async () => { if (availability === 'unavailable') throw new Error('PRIVATE synthetic database diagnostic'); return availability === 'healthy'; }, mongoose: { Types: { ObjectId: { isValid: () => true } } }, hashPersonalAgentApiKey: () => 'unusable-synthetic-hash', PersonalAgent: { findOne: () => ({ select: async () => ({ _id: id, userId: id, save: async () => { saved = true; } }) }) }, console: { error: () => { logged = true; } },
    normalizePersonalAgentCapabilities: value => value, normalizePersonalAgentWorkerRoles: value => value, normalizeAgentActorType: value => value,
    jwt: { verify: () => ({ kind: 'agent_bridge', userId: id, actorType: 'user', actorId: id }) }, getAgentBridgeJwtSecret: () => 'unusable-synthetic-value', AGENT_BRIDGE_TOKEN_KIND: 'agent_bridge' };
  for (const [body, name, headers] of [[personalSource, 'authenticatePersonalAgentKey', { 'x-agent-id': id, 'x-agent-key': 'unusable-synthetic-value' }], [bridgeSource, 'authenticateAgentBridgeToken', { authorization: 'Bearer unusable-synthetic-value' }]]) {
    const authenticate = vm.runInNewContext(`${body}\n${name}`, context);
    for (availability of ['inactive', 'unavailable', 'healthy']) {
      saved = false; logged = false;
      const res = response(); let next = false; const req = { headers };
      await authenticate(req, res, () => { next = true; });
      assert.equal(next, availability === 'healthy');
      if (availability === 'inactive') assert.equal(res.statusCode, 401);
      if (availability === 'unavailable') { assert.equal(res.statusCode, 503); assert.equal(JSON.stringify(res.body), JSON.stringify({ error: 'AUTH_UNAVAILABLE' })); assert.equal(logged, false); }
      if (availability !== 'healthy') { assert.equal(saved, false); assert.equal(req.personalAgent, undefined); assert.equal(req.bridgeActor, undefined); }
      if (availability === 'healthy') assert.ok(req.personalAgent || req.bridgeActor);
    }
  }
});

test('valid old import states cannot reconnect an inactive account or reach a provider', async () => {
  const previousSecret = process.env.JWT_SECRET;
  const nativeFetch = global.fetch;
  let externalRequests = 0; let connectionReads = 0;
  // Only this disposable test process uses the explicitly unusable fixture key.
  process.env.JWT_SECRET = 'unusable-local-test-signing-value';
  global.fetch = (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return nativeFetch(url, options);
    externalRequests++; throw new Error('External provider call is forbidden in this test.');
  };
  const app = express();
  app.use(buildImportRouter({ authenticateToken: () => {}, isAccountActive: async () => false, upload: { single: () => (_req, _res, next) => next() }, IntegrationConnection: { findOne: () => { connectionReads++; throw new Error('No connection query is permitted.'); } }, env: {} }));
  const { server, base } = await listen(app);
  try {
    for (const provider of ['notion', 'readwise']) {
      const payload = { provider, userId: id };
      if (provider === 'readwise') payload.oauthPayload = encryptSecret(JSON.stringify({ codeVerifier: 'unusable-synthetic-verifier', clientId: 'synthetic-client' }));
      const state = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '10m' });
      const result = await global.fetch(`${base}/api/import/${provider}/oauth/callback?${new URLSearchParams({ state, code: 'unusable-synthetic-code' })}`, { redirect: 'manual' });
      assert.equal(result.status, 302);
      assert.equal(new URL(result.headers.get('location')).searchParams.get(provider), 'error');
    }
    assert.equal(externalRequests, 0); assert.equal(connectionReads, 0);
  } finally {
    await new Promise(resolve => server.close(resolve)); global.fetch = nativeFetch;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  }
});
