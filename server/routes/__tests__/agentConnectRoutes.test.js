const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildAgentConnectRouter, hashPollSecret } = require('../agentConnectRoutes');
const {
  hashAgentTokenSecret,
  normalizeAgentTokenScopes,
  sanitizeAgentToken
} = require('../../services/agentTokenService');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

class Query {
  constructor(value) {
    this.value = value;
  }

  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const attachSave = (row) => ({
  ...row,
  async save() {
    this.updatedAt = new Date();
    return this;
  }
});

const createAgentConnectSessionModel = () => {
  const rows = [];
  return {
    rows,
    findOne(query = {}) {
      const row = rows.find(item => String(item.sessionId) === String(query.sessionId));
      return new Query(row || null);
    },
    async create(payload = {}) {
      const row = attachSave({
        _id: new mongoose.Types.ObjectId().toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...payload
      });
      rows.push(row);
      return row;
    }
  };
};

const createAgentTokenModel = () => {
  const rows = [];
  return {
    rows,
    async create(payload = {}) {
      const row = {
        _id: new mongoose.Types.ObjectId().toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...payload
      };
      rows.push(row);
      return row;
    }
  };
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  return { response, body };
};

const run = async () => {
  const AgentConnectSession = createAgentConnectSessionModel();
  const AgentToken = createAgentTokenModel();
  let issueCount = 0;
  let currentTime = new Date('2026-06-05T12:00:00.000Z');
  const app = express();
  app.use(express.json());
  app.use(buildAgentConnectRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    AgentConnectSession,
    AgentToken,
    createAgentTokenSecret: () => `ntk_at_connect_${++issueCount}`,
    hashAgentTokenSecret,
    normalizeAgentTokenScopes,
    sanitizeAgentToken,
    defaultAppUrl: 'https://noeis.example',
    now: () => currentTime
  }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const create = await fetchJson(`${baseUrl}/api/agent-connect/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        runtime: 'hermes',
        label: 'Hermes local',
        scopes: ['read'],
        apiUrl: 'https://api.noeis.example'
      })
    });
    assert.strictEqual(create.response.status, 201);
    assert.strictEqual(create.body.session.runtime, 'hermes');
    assert.strictEqual(create.body.session.label, 'Hermes local');
    assert.deepStrictEqual(create.body.session.scopes, ['read']);
    assert.strictEqual(create.body.session.requestedApiUrl, 'https://api.noeis.example');
    assert(create.body.authorizeUrl.includes('/settings/connected-agents/authorize'));
    assert(create.body.authorizeUrl.includes('session='));
    assert(!create.body.authorizeUrl.includes('secret='));
    assert(!create.body.authorizeUrl.includes(create.body.pollSecret));
    assert(create.body.pollSecret.startsWith('poll_'));
    assert.strictEqual(AgentConnectSession.rows[0].pollSecretHash, hashPollSecret(create.body.pollSecret));
    assert.strictEqual(AgentConnectSession.rows[0].tokenSecret, undefined);

    const approval = await fetchJson(`${baseUrl}/api/agent-connect/sessions/${create.body.session.sessionId}/approval`);
    assert.strictEqual(approval.response.status, 200);
    assert.strictEqual(approval.body.session.status, 'pending');

    const badPoll = await fetchJson(`${baseUrl}/api/agent-connect/sessions/${create.body.session.sessionId}/poll`, {
      method: 'POST',
      body: JSON.stringify({ pollSecret: 'wrong' })
    });
    assert.strictEqual(badPoll.response.status, 403);

    const approve = await fetchJson(`${baseUrl}/api/agent-connect/sessions/${create.body.session.sessionId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ deviceCode: create.body.session.deviceCode })
    });
    assert.strictEqual(approve.response.status, 200);
    assert.strictEqual(approve.body.session.status, 'approved');
    assert.strictEqual(approve.body.token.label, 'Hermes local');
    assert.strictEqual(approve.body.token.runtime, 'hermes');
    assert.deepStrictEqual(approve.body.token.scopes, ['read']);
    assert.strictEqual(approve.body.token.secret, undefined);
    assert.strictEqual(AgentToken.rows[0].hashedSecret, hashAgentTokenSecret('ntk_at_connect_1'));

    const duplicateApprove = await fetchJson(`${baseUrl}/api/agent-connect/sessions/${create.body.session.sessionId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ deviceCode: create.body.session.deviceCode })
    });
    assert.strictEqual(duplicateApprove.response.status, 409);
    assert.strictEqual(AgentToken.rows.length, 1);

    const poll = await fetchJson(`${baseUrl}/api/agent-connect/sessions/${create.body.session.sessionId}/poll`, {
      method: 'POST',
      body: JSON.stringify({ pollSecret: create.body.pollSecret })
    });
    assert.strictEqual(poll.response.status, 200);
    assert.strictEqual(poll.body.session.status, 'approved');
    assert.strictEqual(poll.body.secret, 'ntk_at_connect_1');
    assert.strictEqual(poll.body.tokenId, String(AgentToken.rows[0]._id));

    currentTime = new Date('2026-06-05T12:06:00.000Z');
    const expiredDelivery = await fetchJson(`${baseUrl}/api/agent-connect/sessions/${create.body.session.sessionId}/poll`, {
      method: 'POST',
      body: JSON.stringify({ pollSecret: create.body.pollSecret })
    });
    assert.strictEqual(expiredDelivery.response.status, 410);
    assert.match(expiredDelivery.body.error, /delivery window expired/i);
    assert.strictEqual(AgentConnectSession.rows[0].tokenSecret, '');

    const unsupportedScope = await fetchJson(`${baseUrl}/api/agent-connect/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        runtime: 'codex',
        label: 'Unsafe request',
        scopes: ['read', 'admin']
      })
    });
    assert.strictEqual(unsupportedScope.response.status, 400);
    assert.match(unsupportedScope.body.error, /unsupported scope/i);
    assert.strictEqual(AgentConnectSession.rows.length, 1);

    const unsafeApprovalOrigin = await fetchJson(`${baseUrl}/api/agent-connect/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        runtime: 'codex',
        label: 'Wrong browser',
        scopes: ['read'],
        appUrl: 'https://attacker.example'
      })
    });
    assert.strictEqual(unsafeApprovalOrigin.response.status, 400);
    assert.match(unsafeApprovalOrigin.body.error, /approval origin/i);
    assert.strictEqual(AgentConnectSession.rows.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
