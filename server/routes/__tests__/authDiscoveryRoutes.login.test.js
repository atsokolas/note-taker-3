const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildAuthDiscoveryRouter } = require('../authDiscoveryRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

const run = async () => {
  const users = [
    { _id: 'u1', username: 'Athan', password: 'hashed:right1pass', accountDisabledAt: null },
    { _id: 'u2', username: 'twin', password: 'hashed:twin1pass', accountDisabledAt: null },
    { _id: 'u3', username: 'Twin', password: 'hashed:Twin1pass', accountDisabledAt: null }
  ];
  function User(payload) { Object.assign(this, payload); }
  User.prototype.save = async function save() { users.push(this); return this; };
  User.findOne = async ({ username }) => users.find(user => user.username === username) || null;
  User.find = ({ username }) => ({ limit: async n => users.filter(user => username.test(user.username)).slice(0, n) });

  const app = express();
  app.use(express.json());
  app.use(buildAuthDiscoveryRouter({
    bcrypt: { compare: async (value, hash) => `hashed:${value}` === hash, hash: async value => `hashed:${value}` },
    jwt: { sign: payload => `token-for-${payload.username}` },
    User,
    authenticateToken: (_req, _res, next) => next(),
    Recommendation: {},
    Article: {}
  }));
  const { server, url } = await listen(app);
  const post = (path, body) => fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const login = (username, password) => post('/api/auth/login', { username, password });

  try {
    const lower = await login(' athan ', 'right1pass');
    assert.strictEqual(lower.status, 200, 'a username opens whatever its case');
    assert.strictEqual((await lower.json()).username, 'Athan');

    assert.strictEqual((await login('Twin', 'Twin1pass')).status, 200, 'an exact match wins over a case twin');
    assert.strictEqual((await login('TWIN', 'twin1pass')).status, 401, 'an ambiguous name opens neither');

    const taken = await post('/api/auth/register', { username: 'ATHAN', password: 'another1pass' });
    assert.strictEqual(taken.status, 409, 'a name differing only by case is taken');

    const wrong = await login('athan', 'wrong1pass');
    assert.strictEqual(wrong.status, 401);
    assert.match((await wrong.json()).error, /do not match/);

    for (let i = 0; i < 9; i += 1) await login('athan', 'wrong1pass');
    const throttled = await login('athan', 'right1pass');
    assert.strictEqual(throttled.status, 429, 'ten failures stop even the right password for a while');
    console.log('authDiscoveryRoutes.login tests passed');
  } finally {
    server.close();
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
