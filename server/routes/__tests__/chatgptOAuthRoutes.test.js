const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { buildChatgptOAuthRouter } = require('../chatgptOAuthRoutes');
const { readChatgptOAuthConfig } = require('../../services/chatgptOAuthConfig');
const { buildAuthenticateAgentToken } = require('../../services/agentTokenService');

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
    if ('$ne' in value) return String(row[key]) !== String(value.$ne);
  }
  if (Array.isArray(row[key])) return row[key].includes(value);
  return value === null ? row[key] == null : String(row[key]) === String(value);
});
const memoryModel = () => {
  const rows = [];
  const update = (row, changes) => {
    Object.assign(row, changes.$set || {});
    for (const [key, value] of Object.entries(changes.$push || {})) (row[key] ||= []).push(value);
    return row;
  };
  return {
    rows,
    async create(row) { const doc = { _id: crypto.randomUUID(), revokedAt: null, usedRefreshHashes: [], ...row }; rows.push(doc); return doc; },
    async findOne(query) { return rows.find(row => matches(row, query)) || null; },
    async findOneAndUpdate(query, changes) { const row = rows.find(row => matches(row, query)); return row ? { ...update(row, changes) } : null; },
    async updateOne(query, changes) { const row = rows.find(row => matches(row, query)); if (row) update(row, changes); },
    async updateMany(query, changes) { rows.filter(row => matches(row, query)).forEach(row => update(row, changes)); }
  };
};
const fixture = async (models = {}) => {
  const Request = models.Request || memoryModel(), Grant = models.Grant || memoryModel(), AgentToken = models.AgentToken || memoryModel();
  let time = new Date('2026-10-03T00:00:00Z');
  const app = express();
  app.use(express.json());
  const auth = (req, res, next) => {
    const user = req.headers.authorization?.replace('Bearer ', '');
    if (!['user-a', 'user-b'].includes(user)) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    req.user = { id: models.users?.[user] || user };
    req.authInfo = { tokenSource: req.headers['x-cookie-only'] ? 'cookie' : 'header' };
    next();
  };
  app.use(buildChatgptOAuthRouter({ config, authenticateToken: auth, Request, Grant, AgentToken, now: () => time }));
  app.get('/protected', buildAuthenticateAgentToken({ AgentToken, OAuthGrant: Grant, oauthResource: config.resource, consume: false, now: () => time }), (req, res) => res.json({ user: req.user.id }));
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
  return { Request, Grant, AgentToken, call, authorize, consent, exchange, connect, setTime: value => { time = value; }, close: () => new Promise(resolve => server.close(resolve)) };
};

test('predefined client config fails closed for insecure/unconfigured clients', () => {
  assert.equal(readChatgptOAuthConfig({}), null);
  assert.throws(() => readChatgptOAuthConfig({ NOEIS_CHATGPT_OAUTH_ISSUER: 'http://public.example' }));
  assert.throws(() => readChatgptOAuthConfig({ NOEIS_CHATGPT_OAUTH_ISSUER: config.issuer }));
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
    assert.equal((await f.call('/protected', undefined, token.access_token)).body.user, 'user-b');
    const database = JSON.stringify([f.Request.rows, f.Grant.rows, f.AgentToken.rows]);
    for (const secret of [code, token.access_token, token.refresh_token]) assert.equal(database.includes(secret), false);
    f.AgentToken.rows[0].oauthResource = 'https://wrong.example';
    assert.equal((await f.call('/protected', undefined, token.access_token)).status, 401);
  } finally { await f.close(); }
});
test('expired requests/codes/access tokens rejected and refresh cannot broaden scopes', async () => {
  const f = await fixture();
  try {
    const token = (await f.connect()).body;
    const broaden = await f.call('/oauth/chatgpt/token', { grant_type: 'refresh_token', client_id: 'chatgpt-test', resource: config.resource, refresh_token: token.refresh_token, scope: 'admin' });
    assert.equal(broaden.body.error, 'invalid_scope');
    f.setTime(new Date('2026-10-03T01:00:01Z'));
    assert.equal((await f.call('/protected', undefined, token.access_token)).status, 401);
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
    assert.equal((await f.call('/protected', undefined, first.access_token)).status, 401);
    assert.equal((await f.call('/protected', undefined, second.body.access_token)).status, 200);
    assert.equal((await f.call('/oauth/chatgpt/token', body)).body.error, 'invalid_grant');
    assert.equal((await f.call('/protected', undefined, second.body.access_token)).status, 401);
    assert.equal((await f.call('/oauth/chatgpt/token', { ...body, refresh_token: second.body.refresh_token })).body.error, 'invalid_grant');
  } finally { await f.close(); }
});
test('revocation and existing token revocation prevent refresh; unknown revocation is private', async () => {
  const f = await fixture();
  try {
    const first = (await f.connect()).body;
    assert.equal((await f.call('/oauth/chatgpt/revoke', { client_id: 'chatgpt-test', token: first.access_token })).status, 200);
    assert.equal((await f.call('/protected', undefined, first.access_token)).status, 401);
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
    const { ChatgptOAuthRequest: Request, ChatgptOAuthGrant: Grant } = require('../../models/chatgptOAuthModels');
    const { AgentToken } = require('../../models');
    await Promise.all([Request.init(), Grant.init(), AgentToken.init()]);
    f = await fixture({ Request, Grant, AgentToken, users: { 'user-a': new mongoose.Types.ObjectId().toString(), 'user-b': new mongoose.Types.ObjectId().toString() } });
    f.setTime(new Date());
    const start = await f.authorize();
    const approved = await f.consent(start.requestId);
    const code = new URL(approved.body.redirectUrl).searchParams.get('code');
    const exchanges = await Promise.all([f.exchange(code), f.exchange(code), f.exchange(code)]);
    assert.equal(exchanges.filter(result => result.status === 200).length, 1);
    assert.equal(await AgentToken.countDocuments(), 1);
    const first = exchanges.find(result => result.status === 200).body;
    assert.equal((await f.call('/protected', undefined, first.access_token)).status, 200);
    await mongoose.disconnect();
    await mongoose.connect(mongo.getUri());
    assert.equal((await f.call('/protected', undefined, first.access_token)).status, 200);
    const raw = JSON.stringify(await Grant.find().lean());
    assert.equal(raw.includes(first.refresh_token), false);
    const refreshBody = { grant_type: 'refresh_token', client_id: 'chatgpt-test', resource: config.resource, refresh_token: first.refresh_token };
    const rotations = await Promise.all([f.call('/oauth/chatgpt/token', refreshBody), f.call('/oauth/chatgpt/token', refreshBody)]);
    assert.equal(rotations.filter(result => result.status === 200).length <= 1, true);
    assert.equal(rotations.some(result => result.status === 400), true);
    const grant = await Grant.findOne();
    assert.ok(grant.revokedAt, 'concurrent stale refresh replay revokes the family');
    const minted = rotations.find(result => result.status === 200);
    if (minted) assert.equal((await f.call('/protected', undefined, minted.body.access_token)).status, 401);
    assert.equal((await f.call('/protected', undefined, first.access_token)).status, 401);
  } finally {
    if (f) await f.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
