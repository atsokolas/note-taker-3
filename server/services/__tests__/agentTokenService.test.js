const assert = require('assert');

const {
  createAgentTokenSecret,
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken,
  buildAuthenticateAgentToken,
  requiredScopeForRequest,
  AGENT_TOKEN_SCOPES
} = require('../agentTokenService');
const { AgentToken: AgentTokenModel, AgentConnectSession } = require('../../models');

// Every scope a token may hold is one the database will store.
for (const Model of [AgentTokenModel, AgentConnectSession]) {
  assert.deepStrictEqual(Model.schema.path('scopes').caster.enumValues, AGENT_TOKEN_SCOPES, `${Model.modelName} stores every scope`);
}

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
  const middleware = buildAuthenticateAgentToken({ isAccountActive: async () => true, AgentToken, now: () => now });

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

  const gatewayMiddleware = buildAuthenticateAgentToken({ isAccountActive: async () => true,
    AgentToken,
    now: () => now,
    requiredScope: 'read',
    consume: false
  });
  const gatewayReq = {
    method: 'POST',
    headers: { authorization: 'Bearer ntk_at_active' }
  };
  const gatewayRes = createResponse();
  await runMiddleware(gatewayMiddleware, gatewayReq, gatewayRes);
  assert.strictEqual(gatewayReq.user.id, 'user-1');
  assert.strictEqual(activeToken.callsToday, 0);

  // A capture token saves links and nothing else; agent-write covers capture.
  const captureMiddleware = buildAuthenticateAgentToken({ isAccountActive: async () => true,
    AgentToken, now: () => now, requiredScope: 'capture', consume: false
  });
  const captureRes = createResponse();
  await runMiddleware(captureMiddleware, { method: 'POST', headers: { authorization: 'Bearer ntk_at_active' } }, captureRes);
  assert.strictEqual(captureRes.statusCode, 403);
  activeToken.scopes = ['capture'];
  const captureReq = { method: 'POST', headers: { authorization: 'Bearer ntk_at_active' } };
  await runMiddleware(captureMiddleware, captureReq, createResponse());
  assert.strictEqual(captureReq.user.id, 'user-1');
  const captureWriteRes = createResponse();
  await runMiddleware(middleware, { method: 'POST', headers: { authorization: 'Bearer ntk_at_active' } }, captureWriteRes);
  assert.strictEqual(captureWriteRes.statusCode, 403);
  activeToken.scopes = ['read'];

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
