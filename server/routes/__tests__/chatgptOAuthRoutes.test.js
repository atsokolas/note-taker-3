const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { createChatgptOAuthReadiness } = require('../../services/chatgptOAuthReadiness');
const { buildChatgptOAuthRouter } = require('../chatgptOAuthRoutes');
const { readChatgptOAuthConfig } = require('../../services/chatgptOAuthConfig');
const { buildAuthenticateAgentToken } = require('../../services/agentTokenService');
const { buildChatgptOAuthIngress } = require('../../services/chatgptOAuthIngress');

const config = readChatgptOAuthConfig({
  NOEIS_CHATGPT_OAUTH_ISSUER: 'https://api.noeis.example',
  NOEIS_APP_URL: 'https://noeis.example',
  NOEIS_CHATGPT_OAUTH_CLIENTS: JSON.stringify([{ client_id: 'chatgpt-test', client_name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'] }])
});
const verifier = 'test-pkce-verifier-'.repeat(4);
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

// Same matcher/atomic update shape as Mongo. HTTP tests below assert protocol behavior;
// the optional Mongo suite separately proves actual database consume/rotation atomicity.
const matches = (row, query) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some(condition => matches(row, condition));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('$gt' in value) return row[key] > value.$gt;
    if ('$lt' in value) return row[key] < value.$lt;
    if ('$lte' in value) return row[key] <= value.$lte;
    if ('$ne' in value) return String(row[key]) !== String(value.$ne);
    if ('$all' in value) return value.$all.every(item => (row[key] || []).includes(item));
  }
  if (Array.isArray(row[key])) return row[key].includes(value);
  return value === null ? row[key] == null : String(row[key]) === String(value);
});
const memoryModel = () => {
  const rows = [];
  const update = (row, changes) => {
    Object.assign(row, changes.$set || {});
    for (const [key, value] of Object.entries(changes.$push || {})) (row[key] ||= []).push(value);
    for (const [key, value] of Object.entries(changes.$inc || {})) row[key] = (row[key] || 0) + value;
    return row;
  };
  return {
    rows,
    async create(row) { const doc = { _id: crypto.randomUUID(), revokedAt: null, usedRefreshHashes: [], ...row }; rows.push(doc); return doc; },
    async countDocuments(query) { return rows.filter(row => matches(row, query)).length; },
    async findOne(query) { return rows.find(row => matches(row, query)) || null; },
    async findOneAndUpdate(query, changes) { const row = rows.find(row => matches(row, query)); return row ? { ...update(row, changes) } : null; },
    async updateOne(query, changes) { const row = rows.find(row => matches(row, query)); if (row) update(row, changes); },
    async updateMany(query, changes) { rows.filter(row => matches(row, query)).forEach(row => update(row, changes)); },
    async deleteMany(query) { for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], query)) rows.splice(i, 1); }
  };
};
const fixture = async (models = {}) => {
  const Request = models.Request || memoryModel(), Grant = models.Grant || memoryModel(), AgentToken = models.AgentToken || memoryModel(), Client = models.Client || memoryModel();
  let time = new Date('2026-10-03T00:00:00Z');
  const app = express();
  app.use(buildChatgptOAuthIngress());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  const auth = (req, res, next) => {
    const user = req.headers.authorization?.replace('Bearer ', '');
    if (!['user-a', 'user-b'].includes(user)) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    req.user = { id: models.users?.[user] || user };
    req.authInfo = { tokenSource: req.headers['x-cookie-only'] ? 'cookie' : 'header' };
    next();
  };
  // Protocol-only cases use in-process admission; the Mongo tests below exercise
  // production controls with independent workers and actual atomic pipelines.
  const protocolControls = {
    rate: async () => ({ allowed: true, retryAfter: 60 }),
    admit: async ({ clientId }) => ({ id: crypto.randomUUID(), clientId, expiresAt: new Date(time.getTime() + 600000) }),
    release: async () => {}
  };
  app.use(buildChatgptOAuthRouter({ config: models.config || config, authenticateToken: auth, Request, Grant, AgentToken, Client,
    Control: models.Control, controls: models.controls || (models.Control ? undefined : protocolControls), isReady: models.isReady, now: () => time }));
  app.get('/api/agent-connection', buildAuthenticateAgentToken({ AgentToken, OAuthGrant: Grant, oauthResource: config.resource, consume: false, now: () => time }), (req, res) => res.json({ user: req.user.id }));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, user, headers = {}) => {
    const result = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(user ? { Authorization: `Bearer ${user}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await result.text();
    return { status: result.status, location: result.headers.get('location'), body: text.startsWith('{') ? JSON.parse(text) : text, headers: result.headers };
  };
  const authorize = async (overrides = {}) => {
    const params = new URLSearchParams({ response_type: 'code', client_id: 'chatgpt-test', redirect_uri: config.clients.get('chatgpt-test').redirectUris[0], resource: config.resource, scope: 'read agent-write', state: 'opaque-state', code_challenge: challenge, code_challenge_method: 'S256', ...overrides });
    const result = await call(`/oauth/chatgpt/authorize?${params}`);
    const requestId = result.location && new URL(result.location).searchParams.get('request');
    return { ...result, requestId };
  };
  const consent = (requestId, approved = true, user = 'user-a', headers = {}) => call(`/api/chatgpt/oauth/requests/${requestId}/consent`, { approved }, user, headers);
  const exchange = code => call('/oauth/chatgpt/token', { grant_type: 'authorization_code', client_id: 'chatgpt-test', code, redirect_uri: config.clients.get('chatgpt-test').redirectUris[0], resource: config.resource, code_verifier: verifier });
  const connect = async () => {
    const start = await authorize();
    const approved = await consent(start.requestId);
    return exchange(new URL(approved.body.redirectUrl).searchParams.get('code'));
  };
  return { base, Request, Grant, AgentToken, Client, call, authorize, consent, exchange, connect, setTime: value => { time = value; }, close: () => new Promise(resolve => server.close(resolve)) };
};

test('OAuth issuance stays 503 during index startup and after failure; unrelated app/discovery remain available', async () => {
  const logs = [];
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const attempts = [];
  const models = Object.fromEntries(['Request', 'Grant', 'Control'].map(name => [name, { createIndexes: async () => { attempts.push(name); await pending; } }]));
  const readiness = createChatgptOAuthReadiness({ models, logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) } });
  const f = await fixture({ isReady: readiness.isReady });
  try {
    assert.equal((await f.authorize()).status, 503);
    assert.equal((await f.exchange('not-issued')).status, 503);
    assert.equal((await f.consent('not-issued')).status, 503);
    assert.equal(f.Request.rows.length, 0);
    assert.equal(f.Grant.rows.length, 0);
    assert.equal(f.AgentToken.rows.length, 0);
    assert.equal((await f.call('/.well-known/oauth-authorization-server')).status, 200);
    assert.equal((await f.call('/api/agent-connection')).status, 401);
    finish(); await readiness.settled;
    assert.equal((await f.authorize()).status, 302);
    assert.deepEqual(attempts.sort(), ['Control', 'Grant', 'Request']);
    assert.equal(readiness.isReady(), true);
  } finally { await f.close(); }
  const failed = createChatgptOAuthReadiness({ models: {
    Request: { createIndexes: async () => {} },
    Grant: { createIndexes: async () => { throw new Error('mongodb://secret-password@private-host'); } },
    Control: { createIndexes: async () => {} }
  }, logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) } });
  await failed.settled;
  const blocked = await fixture({ isReady: failed.isReady });
  try {
    assert.equal((await blocked.authorize()).status, 503);
    assert.equal((await blocked.exchange('not-issued')).status, 503);
    assert.equal(blocked.Request.rows.length, 0);
    assert.equal(blocked.AgentToken.rows.length, 0);
    assert.doesNotMatch(JSON.stringify(logs), /secret-password|private-host/);
    assert.ok(logs.some(args => args[1] === 'Grant'));
  } finally { await blocked.close(); }
});

test('predefined client config fails closed for insecure/unconfigured clients', () => {
  assert.equal(readChatgptOAuthConfig({}), null);
  assert.throws(() => readChatgptOAuthConfig({ NOEIS_CHATGPT_OAUTH_ISSUER: 'http://public.example' }));
  assert.throws(() => readChatgptOAuthConfig({ NOEIS_CHATGPT_OAUTH_ISSUER: config.issuer }));
  const base = { NOEIS_CHATGPT_OAUTH_ISSUER: config.issuer,
    NOEIS_CHATGPT_OAUTH_CLIENTS: JSON.stringify([{ client_id: 'bounded', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'] }]) };
  for (const [key, value] of [['NOEIS_OAUTH_TOKEN_GLOBAL_PER_MINUTE', '0'], ['NOEIS_OAUTH_PENDING_GLOBAL', '10001'], ['NOEIS_OAUTH_MAX_REFRESH_ROTATIONS', '4097'], ['NOEIS_OAUTH_REVOKE_CLIENT_PER_MINUTE', 'NaN']]) {
    assert.throws(() => readChatgptOAuthConfig({ ...base, [key]: value }));
  }
});
test('discovery advertises exact resource, issuer, PKCE, public predefined clients', async () => {
  const f = await fixture();
  try {
    const metadata = await f.call('/.well-known/oauth-authorization-server');
    assert.deepEqual(metadata.body.code_challenge_methods_supported, ['S256']);
    assert.equal(metadata.body.authorization_response_iss_parameter_supported, true);
    assert.deepEqual(metadata.body.token_endpoint_auth_methods_supported, ['none']);
    assert.equal((await f.call('/.well-known/oauth-protected-resource')).body.resource, config.resource);
  } finally { await f.close(); }
});
test('rejects redirect substitution, unknown scope, wrong resource, plain PKCE; denial echoes state and issuer', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.authorize({ redirect_uri: 'https://attacker.example/callback' })).status, 400);
    assert.equal((await f.authorize({ client_id: 'unknown' })).status, 400);
    for (const change of [{ scope: 'admin' }, { resource: 'https://attacker.example' }, { code_challenge_method: 'plain' }]) {
      const result = await f.authorize(change);
      const callback = new URL(result.location);
      assert.ok(callback.searchParams.get('error'));
      assert.equal(callback.searchParams.get('iss'), config.issuer);
    }
    const start = await f.authorize();
    assert.equal(f.AgentToken.rows.length, 0);
    assert.equal((await f.call(`/api/chatgpt/oauth/requests/${start.requestId}`)).status, 401);
    assert.equal((await f.consent(start.requestId, true, 'user-a', { 'x-cookie-only': '1' })).status, 403);
    const denied = await f.consent(start.requestId, false);
    const callback = new URL(denied.body.redirectUrl);
    assert.equal(callback.searchParams.get('error'), 'access_denied');
    assert.equal(callback.searchParams.get('state'), 'opaque-state');
    assert.equal(callback.searchParams.get('iss'), config.issuer);
    assert.equal((await f.consent(start.requestId)).status, 409);
    assert.equal(f.AgentToken.rows.length, 0);
  } finally { await f.close(); }
});
test('PKCE and resource checked before atomic single-use exchange; stored credentials hashed; account isolated', async () => {
  const f = await fixture();
  try {
    const start = await f.authorize();
    const consent = await f.consent(start.requestId, true, 'user-b');
    const code = new URL(consent.body.redirectUrl).searchParams.get('code');
    const invalid = await f.call('/oauth/chatgpt/token', { grant_type: 'authorization_code', client_id: 'chatgpt-test', code, code_verifier: 'a'.repeat(43), resource: config.resource, redirect_uri: config.clients.get('chatgpt-test').redirectUris[0] });
    assert.equal(invalid.body.error, 'invalid_grant');
    const results = await Promise.all([f.exchange(code), f.exchange(code)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
    const token = results.find(result => result.status === 200).body;
    assert.equal(token.resource, config.resource);
    assert.equal((await f.call('/api/agent-connection', undefined, token.access_token)).body.user, 'user-b');
    const database = JSON.stringify([f.Request.rows, f.Grant.rows, f.AgentToken.rows]);
    for (const secret of [code, token.access_token, token.refresh_token]) assert.equal(database.includes(secret), false);
    f.AgentToken.rows[0].oauthResource = 'https://wrong.example';
    assert.equal((await f.call('/api/agent-connection', undefined, token.access_token)).status, 401);
  } finally { await f.close(); }
});
test('expired requests/codes/access tokens rejected and refresh cannot broaden scopes', async () => {
  const f = await fixture();
  try {
    const token = (await f.connect()).body;
    const broaden = await f.call('/oauth/chatgpt/token', { grant_type: 'refresh_token', client_id: 'chatgpt-test', resource: config.resource, refresh_token: token.refresh_token, scope: 'admin' });
    assert.equal(broaden.body.error, 'invalid_scope');
    f.setTime(new Date('2026-10-03T01:00:01Z'));
    assert.equal((await f.call('/api/agent-connection', undefined, token.access_token)).status, 401);
    const start = await f.authorize();
    f.setTime(new Date('2026-10-03T01:11:00Z'));
    assert.equal((await f.consent(start.requestId)).status, 409);
    const second = await f.authorize();
    const approved = await f.consent(second.requestId);
    f.setTime(new Date('2026-10-03T01:12:01Z'));
    assert.equal((await f.exchange(new URL(approved.body.redirectUrl).searchParams.get('code'))).body.error, 'invalid_grant');
  } finally { await f.close(); }
});
test('refresh rotates; stale replay revokes entire family including access; cannot cross clients/resources', async () => {
  const f = await fixture();
  try {
    const first = (await f.connect()).body;
    const body = { grant_type: 'refresh_token', client_id: 'chatgpt-test', resource: config.resource, refresh_token: first.refresh_token };
    assert.equal((await f.call('/oauth/chatgpt/token', { ...body, resource: 'https://evil.example' })).body.error, 'invalid_target');
    assert.equal((await f.call('/oauth/chatgpt/token', { ...body, client_id: 'evil' })).body.error, 'invalid_client');
    const second = await f.call('/oauth/chatgpt/token', body);
    assert.equal(second.status, 200);
    assert.notEqual(first.refresh_token, second.body.refresh_token);
    assert.equal(f.AgentToken.rows.length, 1, 'refresh preserves one Connected Agents identity');
    assert.equal((await f.call('/api/agent-connection', undefined, first.access_token)).status, 401);
    assert.equal((await f.call('/api/agent-connection', undefined, second.body.access_token)).status, 200);
    assert.equal((await f.call('/oauth/chatgpt/token', body)).body.error, 'invalid_grant');
    assert.equal((await f.call('/api/agent-connection', undefined, second.body.access_token)).status, 401);
    assert.equal((await f.call('/oauth/chatgpt/token', { ...body, refresh_token: second.body.refresh_token })).body.error, 'invalid_grant');
  } finally { await f.close(); }
});
test('revocation and existing token revocation prevent refresh; unknown revocation is private', async () => {
  const f = await fixture();
  try {
    const first = (await f.connect()).body;
    assert.equal((await f.call('/oauth/chatgpt/revoke', { client_id: 'chatgpt-test', token: first.access_token })).status, 200);
    assert.equal((await f.call('/api/agent-connection', undefined, first.access_token)).status, 401);
    const second = (await f.connect()).body;
    f.AgentToken.rows.at(-1).status = 'revoked';
    assert.equal((await f.call('/oauth/chatgpt/token', { grant_type: 'refresh_token', client_id: 'chatgpt-test', resource: config.resource, refresh_token: second.refresh_token })).body.error, 'invalid_grant');
    assert.equal((await f.call('/oauth/chatgpt/revoke', { client_id: 'chatgpt-test', token: 'unknown' })).status, 200);
  } finally { await f.close(); }
});


test('real Mongo: authorization exchange and refresh rotation are atomic; hashed credentials survive reconnect', async () => {
  const mongoose = require('mongoose');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const path = require('node:path');
  const os = require('node:os');
  const fs = require('node:fs');
  const cached = path.join(os.homedir(), '.cache/mongodb-binaries/mongod-arm64-darwin-8.2.6');
  const mongo = await MongoMemoryServer.create({ binary: fs.existsSync(cached) ? { systemBinary: cached, version: '8.2.6' } : undefined });
  let f;
  try {
    await mongoose.connect(mongo.getUri());
    const { ChatgptOAuthRequest: Request, ChatgptOAuthGrant: Grant, ChatgptOAuthControl: Control } = require('../../models/chatgptOAuthModels');
    const { AgentToken } = require('../../models');
    await Promise.all([Request.init(), Grant.init(), AgentToken.init(), Control.init()]);
    f = await fixture({ Request, Grant, AgentToken, Control, users: { 'user-a': new mongoose.Types.ObjectId().toString(), 'user-b': new mongoose.Types.ObjectId().toString() } });
    f.setTime(new Date());
    const start = await f.authorize();
    const approved = await f.consent(start.requestId);
    const code = new URL(approved.body.redirectUrl).searchParams.get('code');
    const exchanges = await Promise.all([f.exchange(code), f.exchange(code), f.exchange(code)]);
    assert.equal(exchanges.filter(result => result.status === 200).length, 1);
    assert.equal(await AgentToken.countDocuments(), 1);
    const first = exchanges.find(result => result.status === 200).body;
    assert.equal((await f.call('/api/agent-connection', undefined, first.access_token)).status, 200);
    await mongoose.disconnect();
    await mongoose.connect(mongo.getUri());
    assert.equal((await f.call('/api/agent-connection', undefined, first.access_token)).status, 200);
    const raw = JSON.stringify(await Grant.find().lean());
    assert.equal(raw.includes(first.refresh_token), false);
    const refreshBody = { grant_type: 'refresh_token', client_id: 'chatgpt-test', resource: config.resource, refresh_token: first.refresh_token };
    const rotations = await Promise.all([f.call('/oauth/chatgpt/token', refreshBody), f.call('/oauth/chatgpt/token', refreshBody)]);
    assert.equal(rotations.filter(result => result.status === 200).length <= 1, true);
    assert.equal(rotations.some(result => result.status === 400), true);
    const grant = await Grant.findOne();
    assert.ok(grant.revokedAt, 'concurrent stale refresh replay revokes the family');
    const minted = rotations.find(result => result.status === 200);
    if (minted) assert.equal((await f.call('/api/agent-connection', undefined, minted.body.access_token)).status, 401);
    assert.equal((await f.call('/api/agent-connection', undefined, first.access_token)).status, 401);
  } finally {
    if (f) await f.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('read-only refresh cannot add the supported agent-write scope', async () => {
  const f = await fixture();
  try {
    const start = await f.authorize({ scope: 'read' });
    const approved = await f.consent(start.requestId);
    const first = (await f.exchange(new URL(approved.body.redirectUrl).searchParams.get('code'))).body;
    assert.equal(first.scope, 'read');
    const broaden = await f.call('/oauth/chatgpt/token', { grant_type: 'refresh_token', client_id: 'chatgpt-test', resource: config.resource, refresh_token: first.refresh_token, scope: 'read agent-write' });
    assert.equal(broaden.body.error, 'invalid_scope');
    assert.equal((await f.call('/api/agent-connection', undefined, first.access_token)).status, 200);
    assert.deepEqual(f.Grant.rows[0].scopes, ['read']);
  } finally { await f.close(); }
});

test('early OAuth ingress enforces 8192 raw bytes before actual 50MB JSON/form parser order', async () => {
  const f = await fixture();
  try {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../server.js'), 'utf8');
    assert.ok(source.indexOf('app.use(buildChatgptOAuthIngress())') < source.indexOf("app.use(express.json({ limit: '50mb' }))"));
    const post = async (path, body, type, headers = {}) => fetch(`${f.base}${path}`, { method: 'POST', headers: { 'Content-Type': type, ...headers }, body });
    for (const path of ['/oauth/chatgpt/token', '/OAUTH/CHATGPT/TOKEN', '/OaUtH/ChAtGpT/ToKeN', '/oauth/chatgpt/revoke', '/OAUTH/CHATGPT/REVOKE', '/api/chatgpt/oauth/requests/not-real/consent', '/API/CHATGPT/OAUTH/REQUESTS/not-real/CONSENT', '/aPi/ChAtGpT/oAuTh/ReQuEsTs/not-real/CoNsEnT']) {
      assert.equal((await post(path, JSON.stringify({ padding: 'a'.repeat(8200) }), 'application/json')).status, 413);
      assert.equal((await post(path, `padding=${'a'.repeat(8200)}`, 'application/x-www-form-urlencoded')).status, 413);
    }
    const exact = JSON.stringify({ padding: 'a'.repeat(8178) });
    assert.equal(Buffer.byteLength(exact), 8192);
    assert.equal((await post('/oauth/chatgpt/token', exact, 'application/json')).status, 401, 'exactly 8192 bytes parse then fail unknown client');
    assert.equal((await post('/oauth/chatgpt/token', `${exact} `, 'application/json')).status, 413);
    for (const path of ['/oauth/chatgpt/token', '/OAUTH/CHATGPT/TOKEN', '/OaUtH/ChAtGpT/ToKeN', '/API/CHATGPT/OAUTH/REQUESTS/not-real/CONSENT', '/aPi/ChAtGpT/oAuTh/ReQuEsTs/not-real/CoNsEnT']) {
      for (const type of ['text/plain', 'multipart/form-data', 'application/custom+json']) {
        assert.equal((await post(path, '{}', type)).status, 415, path);
      }
      assert.equal((await post(path, '{}', 'application/json', { 'Content-Encoding': 'gzip' })).status, 415, path);
      for (const type of ['application/json', 'application/x-www-form-urlencoded']) {
        const chunkedStatus = await new Promise((resolve, reject) => {
          const req = require('node:http').request(`${f.base}${path}`, { method: 'POST', headers: { 'Content-Type': type } }, res => { res.resume(); res.once('end', () => resolve(res.statusCode)); });
          req.on('error', reject);
          req.write('a'.repeat(4096)); req.write('a'.repeat(4096)); req.end('a');
        });
        assert.equal(chunkedStatus, 413, `${path}: chunked ${type} cannot bypass the byte limit`);
      }
    }
    assert.equal((await post('/oauth/chatgpt/token', '[]', 'application/json')).status, 400);
    assert.equal((await post('/oauth/chatgpt/token', '{bad', 'application/json')).status, 400);
    assert.equal((await post('/oauth/chatgpt/token', 'client_id=chatgpt-test&client_id=attacker', 'application/x-www-form-urlencoded')).status, 400);
    const validForm = await post('/oauth/chatgpt/token', new URLSearchParams({ client_id: 'chatgpt-test', resource: config.resource, grant_type: 'unknown' }).toString(), 'application/x-www-form-urlencoded');
    assert.equal((await validForm.json()).error, 'unsupported_grant_type');
    assert.equal(f.Request.rows.length, 0);
    assert.equal(f.Grant.rows.length, 0);
  } finally { await f.close(); }
});

test('misordered body parsers and missing early middleware fail closed', async () => {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(buildChatgptOAuthIngress());
  app.post('/oauth/chatgpt/token', (_req, res) => res.json({ shouldNotRun: true }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    for (const path of ['/oauth/chatgpt/token', '/OAUTH/CHATGPT/TOKEN', '/OaUtH/ChAtGpT/ToKeN', '/API/CHATGPT/OAUTH/REQUESTS/not-real/CONSENT', '/aPi/ChAtGpT/oAuTh/ReQuEsTs/not-real/CoNsEnT']) {
      for (const type of ['application/json', 'application/x-www-form-urlencoded']) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'POST', headers: { 'Content-Type': type }, body: type === 'application/json' ? '{}' : 'a=b' });
        assert.equal(response.status, 400, path);
        assert.equal((await response.json()).error, 'invalid_parser_order', path);
      }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  const unbounded = express();
  unbounded.use(express.json());
  unbounded.use(buildChatgptOAuthRouter({ config, authenticateToken: (_req, _res, next) => next(),
    Request: memoryModel(), Grant: memoryModel(), AgentToken: memoryModel(),
    controls: { rate: async () => ({ allowed: true }), admit: async () => null, release: async () => {} } }));
  const missing = await new Promise(resolve => { const s = unbounded.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    for (const path of ['/oauth/chatgpt/token', '/OAUTH/CHATGPT/TOKEN', '/OaUtH/ChAtGpT/ToKeN', '/API/CHATGPT/OAUTH/REQUESTS/not-real/CONSENT', '/aPi/ChAtGpT/oAuTh/ReQuEsTs/not-real/CoNsEnT']) {
      for (const type of ['application/json', 'application/x-www-form-urlencoded']) {
        const response = await fetch(`http://127.0.0.1:${missing.address().port}${path}`, { method: 'POST', headers: { 'Content-Type': type }, body: type === 'application/json' ? '{}' : 'a=b' });
        assert.equal(response.status, 400, path);
        assert.equal((await response.json()).error, 'invalid_parser_order', path);
      }
    }
  } finally { await new Promise(resolve => missing.close(resolve)); }
});

const withControlMongo = async (run, { initializeIndexes = true } = {}) => {
  const mongoose = require('mongoose');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const path = require('node:path'), os = require('node:os'), fs = require('node:fs');
  const cached = path.join(os.homedir(), '.cache/mongodb-binaries/mongod-arm64-darwin-8.2.6');
  const mongo = await MongoMemoryServer.create({ binary: fs.existsSync(cached) ? { systemBinary: cached, version: '8.2.6' } : undefined });
  try {
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    const { ChatgptOAuthRequest: Request, ChatgptOAuthGrant: Grant, ChatgptOAuthControl: Control } = require('../../models/chatgptOAuthModels');
    const { AgentToken } = require('../../models');
    // init() was cached by the previous disposable connection, so explicitly
    // create indexes on this database, including the real cleanup TTL index.
    if (initializeIndexes) await Promise.all([Request.createIndexes(), Grant.createIndexes(), Control.createIndexes(), AgentToken.createIndexes()]);
    await run({ Request, Grant, Control, AgentToken, mongoose, mongo });
  } finally { await mongoose.disconnect(); await mongo.stop(); }
};

test('real Mongo: explicit startup index creation verifies unique and TTL indexes with autoIndex disabled', async () => {
  await withControlMongo(async ({ Request, Grant, Control }) => {
    await Promise.all([Request.createCollection(), Grant.createCollection(), Control.createCollection()]);
    for (const model of [Request, Grant, Control]) {
      assert.equal((await model.collection.indexes()).length, 1, 'only Mongo _id index exists before readiness');
    }
    const readiness = createChatgptOAuthReadiness({ models: { ChatgptOAuthRequest: Request, ChatgptOAuthGrant: Grant, ChatgptOAuthControl: Control }, logger: { info: () => {}, error: () => {} } });
    assert.equal(readiness.isReady(), false);
    assert.equal(await readiness.settled, true);
    const requestIndexes = await Request.collection.indexes();
    assert.equal(requestIndexes.find(index => index.key.requestId)?.unique, true);
    assert.equal(requestIndexes.find(index => index.key.expiresAt)?.expireAfterSeconds, 0);
    const grantIndexes = await Grant.collection.indexes();
    assert.equal(grantIndexes.find(index => index.key.familyId)?.unique, true);
    assert.equal(grantIndexes.find(index => index.key.refreshHash)?.unique, true);
    assert.equal(grantIndexes.find(index => index.key.expiresAt)?.expireAfterSeconds, 86400);
    assert.equal((await Control.collection.indexes()).find(index => index.key.expiresAt)?.expireAfterSeconds, 0);
  }, { initializeIndexes: false });
});

test('real Mongo: concurrent workers cannot exceed global/client allocation caps; expired leases reclaim without TTL lag', async () => {
  await withControlMongo(async models => {
    const limitedConfig = { ...config, clients: new Map([...config.clients, ['chatgpt-second', { ...config.clients.get('chatgpt-test'), clientId: 'chatgpt-second' }]]), limits: { ...config.limits, pending: { global: 3, client: 2 } } };
    const workers = await Promise.all([fixture({ ...models, config: limitedConfig }), fixture({ ...models, config: limitedConfig })]);
    const time = new Date();
    workers.forEach(worker => worker.setTime(time));
    try {
      const clientA = await Promise.all(Array.from({ length: 20 }, (_, index) => workers[index % 2].authorize()));
      assert.equal(clientA.filter(result => result.status === 302).length, 2);
      assert.ok(clientA.filter(result => result.status === 429).every(result => result.headers.get('retry-after') === '60'));
      const clientB = await Promise.all(Array.from({ length: 20 }, (_, index) => workers[index % 2].authorize({ client_id: 'chatgpt-second' })));
      assert.equal(clientB.filter(result => result.status === 302).length, 1);
      assert.equal(await models.Request.countDocuments(), 3);
      const admission = await models.Control.findById('admission:global').lean();
      assert.equal(admission.leases.length, 3);
      const keyCount = await models.Control.countDocuments();
      assert.equal(keyCount, 6, 'only global and two known-client rate/admission records');
      await models.mongoose.disconnect();
      await models.mongoose.connect(models.mongo.getUri());
      assert.equal((await workers[0].authorize()).status, 429, 'caps survive reconnect/restart');
      const later = new Date(time.getTime() + 600001);
      workers.forEach(worker => worker.setTime(later));
      assert.equal((await workers[0].authorize()).status, 302, 'expired lease capacity is reclaimed before physical TTL cleanup');
      assert.equal(await models.Request.countDocuments({ expiresAt: { $gt: later } }), 1);
      assert.equal(await models.Request.countDocuments(), 1, 'indexed request cleanup does not depend on TTL monitor timing');
      assert.equal((await models.Control.findById('admission:global')).leases.length, 1);
      const ttl = (await models.Control.collection.indexes()).find(index => index.key.expiresAt);
      assert.equal(ttl.expireAfterSeconds, 0);
    } finally { await Promise.all(workers.map(worker => worker.close())); }
  });
});

test('real Mongo: fixed client/global token and revoke budgets bound unknown credential keys, reset by time', async () => {
  await withControlMongo(async models => {
    const limitedConfig = { ...config, clients: new Map([...config.clients, ['chatgpt-second', { ...config.clients.get('chatgpt-test'), clientId: 'chatgpt-second' }]]), limits: { ...config.limits, token: { global: 10, client: 2 }, revoke: { global: 10, client: 2 } } };
    const workers = await Promise.all([fixture({ ...models, config: limitedConfig }), fixture({ ...models, config: limitedConfig })]);
    const time = new Date(Math.floor(Date.now() / 60000) * 60000 + 1000);
    workers.forEach(worker => worker.setTime(time));
    try {
      const payload = { client_id: 'chatgpt-test', resource: config.resource, grant_type: 'authorization_code', code: 'not-real' };
      const results = await Promise.all(Array.from({ length: 5 }, (_, index) => workers[index % 2].call('/oauth/chatgpt/token', payload)));
      assert.equal(results.filter(result => result.status === 400).length, 2);
      assert.equal(results.filter(result => result.status === 429).length, 3);
      const second = await workers[0].call('/oauth/chatgpt/token', { ...payload, client_id: 'chatgpt-second' });
      assert.equal(second.status, 400, 'separate configured clients are not grouped by shared egress IP');
      for (let i = 0; i < 4; i += 1) assert.equal((await workers[0].call('/oauth/chatgpt/token', { ...payload, client_id: `untrusted-${i}` })).status, 401);
      assert.equal((await workers[0].call('/oauth/chatgpt/token', { ...payload, client_id: 'another-random-id' })).status, 429);
      assert.equal(await models.Control.countDocuments(), 3, 'untrusted IDs and credentials create no new limiter keys');
      const revoked = await Promise.all(Array.from({ length: 5 }, (_, index) => workers[index % 2].call('/oauth/chatgpt/revoke', { client_id: 'chatgpt-test', token: `random-${index}` })));
      assert.equal(revoked.filter(result => result.status === 200).length, 2);
      assert.equal(revoked.filter(result => result.status === 429).length, 3);
      assert.equal(await models.Control.countDocuments(), 5);
      workers.forEach(worker => worker.setTime(new Date(time.getTime() + 60000)));
      assert.equal((await workers[0].call('/oauth/chatgpt/token', payload)).status, 400);
      assert.equal(await models.Grant.countDocuments(), 0);
      assert.equal(await models.Request.countDocuments(), 0);
    } finally { await Promise.all(workers.map(worker => worker.close())); }
  });
});

test('refresh history has a durable bounded rotation cap requiring explicit reconnect', async () => {
  const limitedConfig = { ...config, limits: { ...config.limits, refreshRotations: 1 } };
  const f = await fixture({ config: limitedConfig });
  try {
    const first = (await f.connect()).body;
    const payload = { grant_type: 'refresh_token', client_id: 'chatgpt-test', resource: config.resource, refresh_token: first.refresh_token };
    const second = await f.call('/oauth/chatgpt/token', payload);
    assert.equal(second.status, 200);
    const exhausted = await f.call('/oauth/chatgpt/token', { ...payload, refresh_token: second.body.refresh_token });
    assert.equal(exhausted.body.error, 'invalid_grant');
    assert.equal(f.Grant.rows[0].usedRefreshHashes.length, 1);
    assert.equal(f.Grant.rows[0].refreshCount, 1);
    assert.ok(f.Grant.rows[0].revokedAt);
  } finally { await f.close(); }
});

test('real Mongo: failed request storage releases admission without opening cap races', async () => {
  await withControlMongo(async models => {
    const limitedConfig = { ...config, limits: { ...config.limits, pending: { global: 1, client: 1 } } };
    const failedRequest = {
      deleteMany: query => models.Request.deleteMany(query),
      create: async () => { const error = new Error('isolated definitive validation rejection'); error.name = 'ValidationError'; throw error; }
    };
    const failed = await fixture({ ...models, Request: failedRequest, config: limitedConfig });
    const healthy = await fixture({ ...models, config: limitedConfig });
    const time = new Date(); failed.setTime(time); healthy.setTime(time);
    try {
      assert.equal((await failed.authorize()).status, 500);
      assert.equal((await models.Control.findById('admission:global')).leases.length, 0);
      assert.equal((await healthy.authorize()).status, 302);
      assert.equal((await healthy.authorize()).status, 429);
      assert.equal(await models.Request.countDocuments(), 1);
      // Model a committed insert with a lost acknowledgement. Freeing its lease
      // would allow an attacker to grow rows beyond the admission cap.
      await models.Request.deleteMany({});
      await models.Control.deleteMany({});
      const ambiguousRequest = {
        deleteMany: query => models.Request.deleteMany(query),
        create: async row => { await models.Request.create(row); throw new Error('isolated lost insert acknowledgement'); }
      };
      const uncertain = await fixture({ ...models, Request: ambiguousRequest, config: limitedConfig });
      uncertain.setTime(time);
      try {
        assert.equal((await uncertain.authorize()).status, 500);
        assert.equal((await models.Control.findById('admission:global')).leases.length, 1);
        assert.equal((await healthy.authorize()).status, 429);
        assert.equal(await models.Request.countDocuments(), 1);
      } finally { await uncertain.close(); }
    } finally { await Promise.all([failed.close(), healthy.close()]); }
  });
});

const openConfig = (env = {}) => readChatgptOAuthConfig({
  NOEIS_CHATGPT_OAUTH_ISSUER: 'https://api.noeis.example', NOEIS_APP_URL: 'https://noeis.example', NOEIS_OAUTH_OPEN_CLIENTS: 'true', ...env
});
const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

test('registration is off unless open clients are switched on', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/.well-known/oauth-authorization-server')).body.registration_endpoint, undefined);
    assert.equal((await f.call('/oauth/register', { redirect_uris: [CLAUDE_CALLBACK] })).status, 404);
    assert.equal(f.Client.rows.length, 0);
  } finally { await f.close(); }
  assert.doesNotThrow(() => openConfig());
  assert.throws(() => readChatgptOAuthConfig({ NOEIS_CHATGPT_OAUTH_ISSUER: config.issuer, NOEIS_OAUTH_OPEN_CLIENTS: 'yes' }), 'only "true" opens');
});

test('registration accepts public web, loopback and app-scheme clients; refuses unsafe redirects and secrets', async () => {
  const f = await fixture({ config: openConfig() });
  try {
    assert.equal((await f.call('/.well-known/oauth-authorization-server')).body.registration_endpoint, 'https://api.noeis.example/oauth/register');
    for (const redirect of ['javascript:alert(1)', 'data:text/html,hi', 'http://evil.example/cb', 'https://claude.ai/cb#frag', 'https://user:pw@claude.ai/cb', 'file:///etc/passwd', 'not a url']) {
      assert.equal((await f.call('/oauth/register', { redirect_uris: [redirect] })).status, 400, redirect);
    }
    assert.equal((await f.call('/oauth/register', { redirect_uris: [] })).status, 400);
    assert.equal((await f.call('/oauth/register', { redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'client_secret_basic' })).body.error, 'invalid_client_metadata');
    assert.equal((await f.call('/oauth/register', { redirect_uris: [CLAUDE_CALLBACK], grant_types: ['client_credentials'] })).status, 400);
    assert.equal(f.Client.rows.length, 0);
    const created = await f.call('/oauth/register', { client_name: 'Claude\u0007', redirect_uris: [CLAUDE_CALLBACK, 'http://localhost:6274/oauth/callback', 'cursor://anysphere.cursor-retrieval/oauth/callback'] });
    assert.equal(created.status, 201);
    assert.match(created.body.client_id, /^noeis_[A-Za-z0-9_-]{43}$/);
    assert.equal(created.body.client_name, 'Claude');
    assert.equal(created.body.token_endpoint_auth_method, 'none');
    assert.equal(created.body.client_secret, undefined);
    const unnamed = await f.call('/oauth/register', { redirect_uris: ['https://vscode.dev/redirect'] });
    assert.equal(unnamed.body.client_name, 'vscode.dev');
  } finally { await f.close(); }
});

test('a registered client connects with a person\'s approval, can be held to read-only, and is named by where it returns', async () => {
  const f = await fixture({ config: openConfig() });
  try {
    const { body: { client_id: clientId } } = await f.call('/oauth/register', { client_name: 'Claude', redirect_uris: [CLAUDE_CALLBACK] });
    assert.equal((await f.authorize({ client_id: clientId, redirect_uri: 'https://claude.ai/other' })).status, 400);
    const start = await f.authorize({ client_id: clientId, redirect_uri: CLAUDE_CALLBACK });
    assert.equal(start.status, 302);
    assert.equal(new URL(start.location).pathname, '/settings/connected-agents/connect');
    const shown = await f.call(`/api/chatgpt/oauth/requests/${start.requestId}`, undefined, 'user-a');
    assert.deepEqual({ name: shown.body.clientName, verified: shown.body.clientVerified, returnTo: shown.body.returnTo, scopes: shown.body.scopes },
      { name: 'Claude', verified: false, returnTo: { kind: 'site', name: 'claude.ai' }, scopes: ['read', 'agent-write'] });
    // Never more than was asked; the request stays pending after a refused widening.
    assert.equal((await f.call(`/api/chatgpt/oauth/requests/${start.requestId}/consent`, { approved: true, scopes: ['admin'] }, 'user-a')).status, 400);
    const approved = await f.call(`/api/chatgpt/oauth/requests/${start.requestId}/consent`, { approved: true, scopes: ['read'] }, 'user-a');
    const code = new URL(approved.body.redirectUrl).searchParams.get('code');
    assert.equal(new URL(approved.body.redirectUrl).origin, 'https://claude.ai');
    const tokenBody = { grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: CLAUDE_CALLBACK, resource: config.resource, code_verifier: verifier };
    assert.equal((await f.call('/oauth/chatgpt/token', { ...tokenBody, client_id: 'chatgpt-test' })).status, 401);
    const issued = await f.call('/oauth/chatgpt/token', tokenBody);
    assert.equal(issued.status, 200);
    assert.equal(issued.body.scope, 'read');
    assert.deepEqual({ label: f.AgentToken.rows[0].label, runtime: f.AgentToken.rows[0].runtime, scopes: f.AgentToken.rows[0].scopes },
      { label: 'Claude · claude.ai', runtime: 'mcp', scopes: ['read'] });
    const refreshed = await f.call('/oauth/chatgpt/token', { grant_type: 'refresh_token', client_id: clientId, refresh_token: issued.body.refresh_token, resource: config.resource });
    assert.equal(refreshed.status, 200);
    assert.equal((await f.call('/oauth/chatgpt/token', { grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshed.body.refresh_token, resource: config.resource, scope: 'read agent-write' })).body.error, 'invalid_scope');
  } finally { await f.close(); }
});

test('registered clients expire after 30 unused days, use keeps them, and the client cap holds', async () => {
  const f = await fixture({ config: openConfig({ NOEIS_OAUTH_REGISTERED_CLIENTS_MAX: '2' }) });
  try {
    const t0 = new Date('2026-10-03T00:00:00Z');
    const day = n => new Date(t0.getTime() + n * 86400000);
    const kept = (await f.call('/oauth/register', { redirect_uris: [CLAUDE_CALLBACK] })).body.client_id;
    const idle = (await f.call('/oauth/register', { redirect_uris: [CLAUDE_CALLBACK] })).body.client_id;
    const full = await f.call('/oauth/register', { redirect_uris: [CLAUDE_CALLBACK] });
    assert.equal(full.status, 429);
    f.setTime(day(20));
    assert.equal((await f.authorize({ client_id: kept, redirect_uri: CLAUDE_CALLBACK })).status, 302);
    f.setTime(day(40));
    assert.equal((await f.authorize({ client_id: kept, redirect_uri: CLAUDE_CALLBACK })).status, 302);
    assert.equal((await f.authorize({ client_id: idle, redirect_uri: CLAUDE_CALLBACK })).status, 400);
    assert.equal((await f.call('/oauth/register', { redirect_uris: [CLAUDE_CALLBACK] })).status, 201, 'an expired client frees its place');
  } finally { await f.close(); }
});

test('consent can hold a configured client to read-only too', async () => {
  const f = await fixture();
  try {
    const start = await f.authorize();
    const shown = await f.call(`/api/chatgpt/oauth/requests/${start.requestId}`, undefined, 'user-a');
    assert.deepEqual({ verified: shown.body.clientVerified, returnTo: shown.body.returnTo }, { verified: true, returnTo: { kind: 'site', name: 'chatgpt.com' } });
    const approved = await f.call(`/api/chatgpt/oauth/requests/${start.requestId}/consent`, { approved: true, scopes: ['read'] }, 'user-a');
    const issued = await f.exchange(new URL(approved.body.redirectUrl).searchParams.get('code'));
    assert.equal(issued.body.scope, 'read');
    assert.equal(f.AgentToken.rows[0].label, 'ChatGPT · NOEIS');
    const readOnly = await f.authorize({ scope: 'read' });
    assert.equal((await f.call(`/api/chatgpt/oauth/requests/${readOnly.requestId}/consent`, { approved: true, scopes: ['read', 'agent-write'] }, 'user-a')).status, 409);
  } finally { await f.close(); }
});
