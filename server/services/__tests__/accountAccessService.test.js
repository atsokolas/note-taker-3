const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildAccountAccessCheck, buildBrowserAuthentication } = require('../accountAccessService');
const { buildAuthenticateAgentToken } = require('../agentTokenService');
const id = '111111111111111111111111';
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('current account state, not credential expiry, controls browser access', async () => {
  let available = true;
  const isAccountActive = buildAccountAccessCheck({ User: { exists: async query => {
    assert.deepEqual(query, { _id: id, accountDisabledAt: null });
    return available ? { _id: id } : null;
  } } });
  const verifyToken = value => { assert.equal(value, 'synthetic-session'); return { id, iat: 1, exp: 9999999999 }; };
  for (const optional of [false, true]) {
    const authenticate = buildBrowserAuthentication({ readRequestToken: () => ({ token: 'synthetic-session', tokenSource: 'header' }), verifyToken, isAccountActive, optional });
    available = true;
    let allowed = false;
    const active = {};
    await authenticate(active, response(), () => { allowed = true; });
    assert.equal(allowed, true); assert.equal(active.user.id, id);
    available = false;
    const stale = {}; const res = response(); allowed = false;
    await authenticate(stale, res, () => { allowed = true; });
    assert.equal(res.statusCode, 401); assert.equal(allowed, false); assert.equal(stale.user, undefined);
  }
  assert.equal(await isAccountActive('not-an-account-id'), false);
});

test('missing/invalid browser credentials retain required and optional behavior', async () => {
  for (const optional of [false, true]) {
    for (const token of ['', 'expired', 'invalid']) {
      const auth = buildBrowserAuthentication({ optional, readRequestToken: () => ({ token }), verifyToken: () => { const error = new Error('synthetic'); error.name = token === 'expired' ? 'TokenExpiredError' : 'JsonWebTokenError'; throw error; }, isAccountActive: () => { throw new Error('Should not query an invalid credential.'); } });
      const res = response(); let next = false;
      await auth({}, res, () => { next = true; });
      assert.equal(next, optional);
      if (!optional) assert.equal(res.body.error, token === '' ? 'AUTH_REQUIRED' : token === 'expired' ? 'AUTH_EXPIRED' : 'AUTH_INVALID');
    }
  }
});

test('account lookup failure denies access including optional authentication', async () => {
  for (const optional of [false, true]) {
    const auth = buildBrowserAuthentication({ optional, readRequestToken: () => ({ token: 'synthetic-session' }), verifyToken: () => ({ id }), isAccountActive: async () => { throw new Error('Database unavailable'); } });
    const res = response(); let next = false;
    await auth({}, res, () => { next = true; });
    assert.equal(next, false); assert.equal(res.statusCode, 503);
  }
});

test('actual token reader handles malformed cookies without rejecting middleware and honors Bearer precedence', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
  const readerSource = source.slice(source.indexOf('const getCookieValue ='), source.indexOf('const { buildAccountAccessCheck'));
  const readRequestToken = vm.runInNewContext(`${readerSource}\nreadRequestToken`);
  for (const optional of [false, true]) {
    let checked = false;
    const auth = buildBrowserAuthentication({ optional, readRequestToken, verifyToken: token => { assert.equal(token, 'healthy-synthetic-session'); return { id }; }, isAccountActive: async () => { checked = true; return true; } });
    const res = response(); let continued = false;
    await auth({ headers: { cookie: 'token=%' } }, res, () => { continued = true; });
    assert.equal(continued, optional); assert.equal(checked, false);
    if (!optional) assert.deepEqual(res.body, { error: 'AUTH_INVALID' });
    continued = false;
    const req = { headers: { authorization: 'Bearer healthy-synthetic-session', cookie: 'token=%' } };
    await auth(req, response(), () => { continued = true; });
    assert.equal(continued, true); assert.equal(checked, true); assert.equal(req.authInfo.tokenSource, 'header');
  }
});

test('agent account lookup failure is generic 503 with no error forwarding or quota/grant mutation', async () => {
  let saved = false; let grantRead = false; let forwarded = false;
  const auth = buildAuthenticateAgentToken({ AgentToken: { findOne: async () => ({ userId: id, status: 'active', oauthFamilyId: 'synthetic-family', save: async () => { saved = true; } }) }, isAccountActive: async () => { throw new Error('PRIVATE synthetic database diagnostic'); }, OAuthGrant: { findOne: async () => { grantRead = true; } } });
  const res = response();
  await auth({ headers: { authorization: 'Bearer ntk_at_synthetic-unusable' }, method: 'GET' }, res, () => { forwarded = true; });
  assert.equal(res.statusCode, 503); assert.deepEqual(res.body, { error: 'AUTH_UNAVAILABLE' });
  assert.equal(saved, false); assert.equal(grantRead, false); assert.equal(forwarded, false);
});

test('removed or disabled account cannot use a still-valid legacy/connector token', async () => {
  for (const oauthFamilyId of ['', 'synthetic-family']) {
    let saved = false; let grantRead = false; let next = false;
    const token = { userId: id, status: 'active', scopes: ['read'], oauthFamilyId, save: async () => { saved = true; } };
    const auth = buildAuthenticateAgentToken({ AgentToken: { findOne: async () => token }, isAccountActive: async () => false, OAuthGrant: { findOne: async () => { grantRead = true; } } });
    const res = response();
    await auth({ headers: { authorization: 'Bearer ntk_at_synthetic-unusable' }, method: 'GET' }, res, () => { next = true; });
    assert.equal(res.statusCode, 401); assert.equal(next, false); assert.equal(saved, false); assert.equal(grantRead, false);
  }
  assert.throws(() => buildAuthenticateAgentToken({ AgentToken: {} }), /Account access check is required/);
});
