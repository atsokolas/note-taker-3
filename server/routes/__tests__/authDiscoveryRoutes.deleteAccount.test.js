const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildAuthDiscoveryRouter } = require('../authDiscoveryRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

const run = async () => {
  const account = { _id: 'user-1', password: 'hashed:right1pass', accountDisabledAt: null };
  const updates = [];
  const User = {
    findById: async (id) => (id === account._id ? account : null),
    updateOne: async (query, update) => { updates.push({ query, update }); }
  };
  const app = express();
  app.use(express.json());
  app.use(buildAuthDiscoveryRouter({
    bcrypt: { compare: async (value, hash) => `hashed:${value}` === hash },
    jwt: {},
    User,
    authenticateToken: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
    Recommendation: {},
    Article: {}
  }));
  const { server, url } = await listen(app);
  const del = (body) => fetch(`${url}/api/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  try {
    const wrong = await del({ password: 'nope' });
    assert.strictEqual(wrong.status, 401, 'a wrong password closes nothing');
    assert.strictEqual(updates.length, 0);

    const right = await del({ password: 'right1pass' });
    assert.strictEqual(right.status, 200);
    const body = await right.json();
    assert.strictEqual(body.deleted, true);
    assert.strictEqual(updates.length, 1);
    const set = updates[0].update.$set;
    assert.ok(set.accountDisabledAt instanceof Date, 'access ends at once');
    assert.strictEqual(set.accountDeletionRequestedAt, set.accountDisabledAt, 'the runbook can find the request');
    assert.deepStrictEqual(updates[0].query, { _id: 'user-1', accountDisabledAt: null });
    console.log('authDiscoveryRoutes.deleteAccount tests passed');
  } finally {
    server.close();
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
