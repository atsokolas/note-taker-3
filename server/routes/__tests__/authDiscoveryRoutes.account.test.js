const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildAuthDiscoveryRouter } = require('../authDiscoveryRoutes');

const run = async () => {
  process.env.FEEDBACK_ADMIN_USERNAMES = 'owner';
  const accounts = {
    u1: { _id: 'u1', username: 'reader', password: 'hashed:old1pass', createdAt: new Date('2026-10-01T00:00:00Z'), accountDisabledAt: null },
    u2: { _id: 'u2', username: 'owner', password: 'hashed:own1pass', createdAt: null, accountDisabledAt: null }
  };
  const User = {
    findById: async id => accounts[id] || null,
    updateOne: async ({ _id }, { $set }) => Object.assign(accounts[_id], $set)
  };
  const app = express();
  app.use(express.json());
  app.use(buildAuthDiscoveryRouter({
    bcrypt: { compare: async (value, hash) => `hashed:${value}` === hash, hash: async value => `hashed:${value}` },
    jwt: {},
    User,
    authenticateToken: (req, _res, next) => { req.user = { id: req.headers['x-user'] }; next(); },
    Recommendation: {},
    Article: {}
  }));
  const server = await new Promise(resolve => { const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (method, path, user, body) => fetch(`${url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-user': user },
    body: body ? JSON.stringify(body) : undefined
  });

  try {
    const reader = await (await call('GET', '/api/account', 'u1')).json();
    assert.deepStrictEqual(reader, { username: 'reader', since: '2026-10-01T00:00:00.000Z', admin: false });
    assert.strictEqual((await (await call('GET', '/api/account', 'u2')).json()).admin, true, 'the admin list sees the operator tools');

    assert.strictEqual((await call('PUT', '/api/account/password', 'u1', { password: 'wrong1pass', newPassword: 'new1passw' })).status, 401);
    const weak = await call('PUT', '/api/account/password', 'u1', { password: 'old1pass', newPassword: 'short' });
    assert.strictEqual(weak.status, 400);
    assert.match((await weak.json()).error, /at least 8/);
    assert.strictEqual(accounts.u1.password, 'hashed:old1pass', 'a refused change changes nothing');

    assert.strictEqual((await call('PUT', '/api/account/password', 'u1', { password: 'old1pass', newPassword: 'new1passw' })).status, 200);
    assert.strictEqual(accounts.u1.password, 'hashed:new1passw');
    console.log('authDiscoveryRoutes.account tests passed');
  } finally {
    server.close();
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
