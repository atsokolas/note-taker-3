const assert = require('assert');

const {
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken,
  buildAuthenticateAgentToken,
  requiredScopeForRequest
} = require('../agentTokenService');

const createResponse = () => {
  const headers = {};
  return {
    statusCode: 200,
    body: null,
    headers,
    set(name, value) {
      headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
};

const runMiddleware = (middleware, req, res) => new Promise((resolve, reject) => {
  middleware(req, res, (error) => {
    if (error) reject(error);
    else resolve();
  });
  if (res.body) resolve();
});

const run = async () => {
  const secret = createAgentTokenSecret();
  assert(secret.startsWith('ntk_at_'));
  assert.notStrictEqual(hashAgentTokenSecret(secret), secret);
  assert.deepStrictEqual(normalizeAgentTokenScopes(['read', 'bad', 'agent-write', 'read']), ['read', 'agent-write']);
  assert.deepStrictEqual(normalizeAgentTokenScopes([]), ['read']);
  assert.strictEqual(requiredScopeForRequest({ method: 'GET' }), 'read');
  assert.strictEqual(requiredScopeForRequest({ method: 'POST' }), 'agent-write');

  const now = new Date('2026-05-16T12:00:00.000Z');
  const records = new Map();
  const activeToken = {
    _id: 'token-1',
    userId: 'user-1',
    label: 'Codex',
    hashedSecret: hashAgentTokenSecret('ntk_at_active'),
    secretPrefix: 'ntk_at_activ...',
    scopes: ['read'],
    dailyQuota: 2,
    callsToday: 1,
    quotaWindowStartedAt: new Date('2026-05-16T00:00:00.000Z'),
    status: 'active',
    async save() {
      records.set(this.hashedSecret, this);
      return this;
    }
  };
  records.set(activeToken.hashedSecret, activeToken);

  const AgentToken = {
    async findOne(query = {}) {
      return records.get(query.hashedSecret) || null;
    }
  };
  const middleware = buildAuthenticateAgentToken({ AgentToken, now: () => now });

  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer ntk_at_active' }
  };
  const res = createResponse();
  await runMiddleware(middleware, req, res);
  assert.strictEqual(req.user.id, 'user-1');
  assert.strictEqual(req.agentToken.callsToday, 2);
  assert.strictEqual(activeToken.callsToday, 2);
  assert(!sanitizeAgentToken(activeToken).hashedSecret);

  const quotaReq = {
    method: 'GET',
    headers: { authorization: 'Bearer ntk_at_active' }
  };
  const quotaRes = createResponse();
  await runMiddleware(middleware, quotaReq, quotaRes);
  assert.strictEqual(quotaRes.statusCode, 429);
  assert.strictEqual(Boolean(quotaRes.headers['Retry-After']), true);

  const writeReq = {
    method: 'POST',
    headers: { authorization: 'Bearer ntk_at_active' }
  };
  const writeRes = createResponse();
  activeToken.callsToday = 0;
  await runMiddleware(middleware, writeReq, writeRes);
  assert.strictEqual(writeRes.statusCode, 403);

  const revokedToken = {
    ...activeToken,
    hashedSecret: hashAgentTokenSecret('ntk_at_revoked'),
    status: 'revoked'
  };
  records.set(revokedToken.hashedSecret, revokedToken);
  const revokedReq = {
    method: 'GET',
    headers: { authorization: 'Bearer ntk_at_revoked' }
  };
  const revokedRes = createResponse();
  await runMiddleware(middleware, revokedReq, revokedRes);
  assert.strictEqual(revokedRes.statusCode, 401);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
