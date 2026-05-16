const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildAgentTokenRouter } = require('../agentTokenRoutes');
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

  sort() {
    return Promise.resolve(this.value);
  }
}

const createAgentTokenModel = () => {
  const rows = [];
  return {
    rows,
    find(query = {}) {
      return new Query(rows.filter(row => String(row.userId) === String(query.userId)));
    },
    async create(payload = {}) {
      const row = {
        _id: new mongoose.Types.ObjectId().toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...payload
      };
      rows.push(row);
      return row;
    },
    async findOneAndUpdate(query = {}, updates = {}) {
      const row = rows.find(item => (
        String(item._id) === String(query._id) &&
        String(item.userId) === String(query.userId)
      ));
      if (!row) return null;
      Object.assign(row, updates, { updatedAt: new Date() });
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
  const AgentToken = createAgentTokenModel();
  let issueCount = 0;
  const app = express();
  app.use(express.json());
  app.use(buildAgentTokenRouter({
    mongoose,
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    AgentToken,
    createAgentTokenSecret: () => `ntk_at_secret_${++issueCount}`,
    hashAgentTokenSecret,
    normalizeAgentTokenScopes,
    sanitizeAgentToken
  }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const create = await fetchJson(`${baseUrl}/api/agent-tokens`, {
      method: 'POST',
      body: JSON.stringify({
        label: 'Codex local',
        scopes: ['read', 'agent-write'],
        dailyQuota: 10
      })
    });
    assert.strictEqual(create.response.status, 201);
    assert.strictEqual(create.body.secret, 'ntk_at_secret_1');
    assert.strictEqual(create.body.token.label, 'Codex local');
    assert.strictEqual(create.body.token.hashedSecret, undefined);
    assert.strictEqual(create.body.token.secret, undefined);
    assert.strictEqual(AgentToken.rows[0].hashedSecret, hashAgentTokenSecret('ntk_at_secret_1'));

    const list = await fetchJson(`${baseUrl}/api/agent-tokens`);
    assert.strictEqual(list.response.status, 200);
    assert.strictEqual(list.body.tokens.length, 1);
    assert.strictEqual(list.body.tokens[0].secret, undefined);
    assert.strictEqual(list.body.tokens[0].hashedSecret, undefined);

    const revoke = await fetchJson(`${baseUrl}/api/agent-tokens/${create.body.token._id}/revoke`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(revoke.response.status, 200);
    assert.strictEqual(revoke.body.token.status, 'revoked');

    const del = await fetchJson(`${baseUrl}/api/agent-tokens/${create.body.token._id}`, {
      method: 'DELETE'
    });
    assert.strictEqual(del.response.status, 200);
    assert.strictEqual(del.body.token.status, 'revoked');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
