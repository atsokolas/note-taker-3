const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildAuthDiscoveryRouter } = require('../authDiscoveryRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve({
      server,
      url: `http://127.0.0.1:${address.port}`
    });
  });
});

const buildUserModel = () => {
  const users = [];

  function User(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || `user-${users.length + 1}`;
  }

  User.exists = async ({ username } = {}) => users.some((entry) => entry.username === username);

  User.prototype.save = async function save() {
    users.push(this);
    return this;
  };

  return User;
};

const run = async () => {
  const trackCalls = [];
  const User = buildUserModel();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-marketing-signup';
    next();
  });
  app.use(buildAuthDiscoveryRouter({
    bcrypt: {
      hash: async (value) => `hashed:${value}`
    },
    jwt: {},
    User,
    authenticateToken: (_req, _res, next) => next(),
    Recommendation: {},
    Article: {},
    trackEvent: (payload) => {
      trackCalls.push(payload);
    },
    EVENT_NAMES: {
      USER_SIGNUP: 'user_signup'
    }
  }));

  const { server, url } = await listen(app);
  try {
    const response = await fetch(`${url}/api/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        username: 'alice',
        password: 'secret12',
        marketingAttribution: {
          visitorId: 'visitor-1',
          entry: 'ai-second-brain',
          cta: 'hero',
          pageType: 'guide',
          utmSource: 'google',
          utmMedium: 'organic'
        }
      })
    });
    const payload = await response.json();

    assert.strictEqual(response.status, 201, `Registration should succeed. body=${JSON.stringify(payload)}`);
    assert.strictEqual(trackCalls.length, 1, 'Registration should emit one analytics event.');
    assert.strictEqual(trackCalls[0].event, 'user_signup');
    assert.strictEqual(trackCalls[0].userId, 'user-1');
    assert.strictEqual(trackCalls[0].requestId, 'req-marketing-signup');
    assert.strictEqual(trackCalls[0].properties.entry, 'ai-second-brain');
    assert.strictEqual(trackCalls[0].properties.cta, 'hero');
    assert.strictEqual(trackCalls[0].properties.pageType, 'guide');
    assert.strictEqual(trackCalls[0].properties.utmSource, 'google');
    assert.strictEqual(trackCalls[0].properties.utmMedium, 'organic');
    assert.strictEqual(trackCalls[0].properties.visitorId, 'visitor-1');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('authDiscoveryRoutes marketing attribution test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
