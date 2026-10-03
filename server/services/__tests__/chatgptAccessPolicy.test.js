const assert = require('node:assert/strict');
const { isChatgptRequestAllowed } = require('../chatgptAccessPolicy');
const { buildAuthenticateAgentToken, hashAgentTokenSecret, sanitizeAgentToken } = require('../agentTokenService');
const response = () => ({ statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const secret = 'ntk_at_restricted';
const baseToken = { _id: 'token', userId: 'owner', hashedSecret: hashAgentTokenSecret(secret), status: 'active', scopes: ['read', 'agent-write'], oauthFamilyId: 'family', oauthClientId: 'client', oauthResource: 'https://api.example/mcp' };
(async () => {
  for (const path of ['/api/agent-connection', '/api/articles', '/articles/source', '/api/articles/source/highlights', '/api/highlights/highlight', '/api/notebook/entry', '/api/notebook/folders', '/api/concepts/topic/notes', '/api/wiki/pages/page/research-candidate', '/api/editions/issue']) {
    assert.equal(isChatgptRequestAllowed({ method: 'GET', originalUrl: `${path}?limit=5` }), true, path);
  }
  for (const path of ['/api/editions/file', '/articles/source/highlights/highlight/thoughts', '/api/wiki/ingest', '/api/wiki/pages/page/sources', '/api/wiki/pages/page/ai/draft']) {
    assert.equal(isChatgptRequestAllowed({ method: 'POST', originalUrl: path }), true, path);
  }
  for (const [method, path] of [['PATCH','/api/wiki/pages/page'], ['POST','/api/wiki/proposals/proposal/accept'], ['POST','/api/wiki/proposals/proposal/merge'], ['PUT','/articles/source/highlights/highlight'], ['POST','/api/editions'], ['POST','/api/edition-profiles'], ['POST','/api/wiki/pages/page/ai/draft/async'], ['GET','/api/notebook/organize/claims'], ['GET','/api/editions/issue/share']]) {
    assert.equal(isChatgptRequestAllowed({ method, originalUrl: path }), false, `${method} ${path}`);
  }
  const authorize = async (token, method, path, grant = { scopes: ['read', 'agent-write'] }) => {
    let next = false;
    const req = { method, originalUrl: path, headers: { authorization: `Bearer ${secret}` } };
    const res = response();
    const middleware = buildAuthenticateAgentToken({ AgentToken: { findOne: async () => token }, OAuthGrant: { findOne: async query => { assert.equal(query.userId, 'owner'); assert.equal(query.clientId, 'client'); assert.equal(query.resource, 'https://api.example/mcp'); return grant; } }, oauthResource: 'https://api.example/mcp', consume: false });
    await middleware(req, res, error => { if (error) throw error; next = true; });
    return { next, req, res };
  };
  for (const [method,path] of [['PATCH','/api/wiki/pages/page'], ['POST','/api/wiki/proposals/proposal/accept'], ['PUT','/articles/source/highlights/highlight'], ['POST','/api/editions/issue/share']]) {
    const result = await authorize(baseToken, method, path);
    assert.equal(result.next, false); assert.equal(result.res.statusCode, 403); assert.equal(result.res.body.code, 'CHATGPT_ACTION_NOT_ALLOWED');
    const legacy = await authorize({ ...baseToken, oauthFamilyId: '', runtime: 'chatgpt' }, method, path);
    assert.equal(legacy.next, true, 'legacy runtime label must not change authorization');
  }
  const allowed = await authorize(baseToken, 'POST', '/api/editions/file');
  assert.equal(allowed.next, true); assert.equal(allowed.req.agentToken.accessProfile, 'chatgpt');
  const readOnly = await authorize({ ...baseToken, scopes: ['read'] }, 'POST', '/api/editions/file');
  assert.equal(readOnly.res.statusCode, 403); assert.equal(readOnly.next, false);
  const revoked = await authorize(baseToken, 'GET', '/api/articles', null);
  assert.equal(revoked.res.statusCode, 401);
  assert.equal(sanitizeAgentToken({ runtime: 'chatgpt' }).accessProfile, null);
  console.log('ChatGPT REST policy, persisted provenance, scopes and legacy compatibility passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
