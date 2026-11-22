const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildAgentConnectRouter, hashPollSecret } = require('../agentConnectRoutes');
const {
  hashAgentTokenSecret,
  normalizeAgentTokenScopes
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

const matches = (row, query) => Object.entries(query).every(([key, want]) => {
  const have = row[key] ?? null;
  if (want && typeof want === 'object' && '$gt' in want) return have > want.$gt;
  return String(have) === String(want);
});

const createAgentConnectSessionModel = () => {
  const rows = [];
  return {
    rows,
    findOne(query = {}) {
      return new Query(rows.find(row => matches(row, query)) || null);
    },
    // One atomic step, as Mongo does it: the first caller to match wins.
    async findOneAndUpdate(query, { $set }) {
      const row = rows.find(item => matches(item, query));
      if (row) Object.assign(row, $set);
      return row || null;
    },
    async create(payload = {}) {
      const row = attachSave({
        _id: new mongoose.Types.ObjectId().toString(),
        tokenId: null,
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
  function AgentToken(payload = {}) {
    Object.assign(this, { _id: new mongoose.Types.ObjectId().toString(), ...payload });
  }
  AgentToken.prototype.save = async function save() {
    rows.push(this);
    return this;
  };
  AgentToken.rows = rows;
  return AgentToken;
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
  const currentTime = new Date('2026-06-05T12:00:00.000Z');
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
    assert.match(create.body.session.deviceCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const { sessionId, deviceCode } = create.body.session;
    const at = path => `${baseUrl}/api/agent-connect/sessions/${sessionId}/${path}`;
    const post = (path, body) => fetchJson(at(path), { method: 'POST', body: JSON.stringify(body) });

    const approval = await fetchJson(at('approval'));
    assert.strictEqual(approval.response.status, 200);
    assert.strictEqual(approval.body.session.status, 'pending');
    assert.strictEqual(approval.body.session.deviceCode, undefined, 'the page never learns the code; you type it from the agent');

    assert.strictEqual((await post('poll', { pollSecret: 'wrong' })).response.status, 403);
    assert.strictEqual((await post('approve', {})).response.status, 403, 'a link alone approves nothing');
    assert.strictEqual((await post('approve', { deviceCode: 'WRONG-CODE' })).response.status, 403);

    const pending = await post('poll', { pollSecret: create.body.pollSecret });
    assert.strictEqual(pending.body.session.status, 'pending');
    assert.strictEqual(pending.body.secret, undefined);

    const [approve, again] = await Promise.all([
      post('approve', { deviceCode: deviceCode.toLowerCase() }),
      post('approve', { deviceCode })
    ]);
    assert.deepStrictEqual([approve.response.status, again.response.status].sort(), [200, 409], 'two clicks approve once');
    assert.strictEqual(AgentToken.rows.length, 0, 'no token exists until the agent collects it');

    const [poll, second] = await Promise.all([
      post('poll', { pollSecret: create.body.pollSecret }),
      post('poll', { pollSecret: create.body.pollSecret })
    ]);
    const collected = [poll, second].find(reply => reply.body.secret);
    assert.strictEqual(collected.body.secret, 'ntk_at_connect_1');
    assert.deepStrictEqual([poll.response.status, second.response.status].sort(), [200, 410], 'the secret is handed out once');
    assert.strictEqual(AgentToken.rows.length, 1);
    const [token] = AgentToken.rows;
    assert.strictEqual(token.hashedSecret, hashAgentTokenSecret('ntk_at_connect_1'));
    assert.strictEqual(String(token.userId), 'user-1');
    assert.strictEqual(token.label, 'Hermes local');
    assert.deepStrictEqual(token.scopes, ['read']);
    assert.strictEqual(collected.body.tokenId, String(token._id));
    assert(!JSON.stringify(AgentConnectSession.rows).includes('ntk_at_connect_1'), 'the secret is never stored');

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
