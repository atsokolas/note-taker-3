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
    now: () => new Date('2026-06-05T12:00:00.000Z')
  }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const create = await fetchJson(`${baseUrl}/api/agent-connect/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        runtime: 'hermes',
        label: 'Hermes local',
        scopes: ['read', 'agent-write']
      })
    });
    assert.strictEqual(create.response.status, 201);
    assert.strictEqual(create.body.session.runtime, 'hermes');
    assert.strictEqual(create.body.session.label, 'Hermes local');
    assert(create.body.authorizeUrl.includes('/settings/connected-agents/authorize'));
    assert(create.body.authorizeUrl.includes('session='));
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
      body: JSON.stringify({ pollSecret: create.body.pollSecret })
    });
    assert.strictEqual(approve.response.status, 200);
    assert.strictEqual(approve.body.session.status, 'approved');
    assert.strictEqual(approve.body.token.label, 'Hermes local');
    assert.strictEqual(approve.body.token.secret, undefined);
    assert.strictEqual(AgentToken.rows[0].hashedSecret, hashAgentTokenSecret('ntk_at_connect_1'));

    const poll = await fetchJson(`${baseUrl}/api/agent-connect/sessions/${create.body.session.sessionId}/poll`, {
      method: 'POST',
      body: JSON.stringify({ pollSecret: create.body.pollSecret })
    });
    assert.strictEqual(poll.response.status, 200);
    assert.strictEqual(poll.body.session.status, 'approved');
    assert.strictEqual(poll.body.secret, 'ntk_at_connect_1');
    assert.strictEqual(poll.body.tokenId, String(AgentToken.rows[0]._id));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
