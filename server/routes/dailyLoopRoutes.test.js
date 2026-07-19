const assert = require('assert');
const express = require('express');
const { buildDailyLoopRouter } = require('./dailyLoopRoutes');
const { signUnsubscribeToken } = require('../services/morningPaperEmailService');

const user = {
  _id: '507f1f77bcf86cd799439011',
  morningPaper: {
    enabled: false,
    email: '',
    emailConfirmedAt: null,
    timezone: 'UTC',
    sendHourLocal: 7,
    unsubscribedAt: null,
    unsubscribeTokenVersion: 1
  },
  async save() { return this; }
};

const thenable = (value) => {
  const query = {
    select: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return query;
};

const User = {
  findById: id => thenable(String(id) === String(user._id) ? user : null),
  updateOne: async () => ({ acknowledged: true })
};

const app = express();
app.use(express.json());
app.use(buildDailyLoopRouter({
  authenticateToken: (req, _res, next) => { req.user = { id: user._id }; next(); },
  User,
  env: {
    EMAIL_DISABLED: 'true',
    MORNING_PAPER_UNSUBSCRIBE_SECRET: 'route-test-secret'
  }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const text = await response.text();
    let body = text;
    try { body = JSON.parse(text); } catch (_error) { /* HTML/text response */ }
    return { response, body };
  };
  try {
    const initial = await request('/api/morning-paper/settings');
    assert.strictEqual(initial.response.status, 200);
    assert.strictEqual(initial.body.settings.enabled, false);

    const blocked = await request('/api/morning-paper/settings', {
      method: 'PATCH', body: JSON.stringify({ enabled: true })
    });
    assert.strictEqual(blocked.response.status, 409);

    const confirmed = await request('/api/morning-paper/settings', {
      method: 'PATCH',
      body: JSON.stringify({ email: 'qa@example.com', timezone: 'America/Chicago', sendHourLocal: 8, confirmEmail: true })
    });
    assert.strictEqual(confirmed.response.status, 200);
    assert.strictEqual(confirmed.body.settings.emailConfirmed, true);
    assert.strictEqual(confirmed.body.settings.enabled, false);

    const enabled = await request('/api/morning-paper/settings', {
      method: 'PATCH', body: JSON.stringify({ enabled: true })
    });
    assert.strictEqual(enabled.response.status, 200);
    assert.strictEqual(enabled.body.settings.enabled, true);

    const token = signUnsubscribeToken({
      userId: user._id,
      version: user.morningPaper.unsubscribeTokenVersion,
      secret: 'route-test-secret'
    });
    const firstUnsubscribe = await request(`/api/morning-paper/unsubscribe?token=${encodeURIComponent(token)}`);
    assert.strictEqual(firstUnsubscribe.response.status, 200);
    assert.match(firstUnsubscribe.body, /unsubscribed/i);
    assert.strictEqual(user.morningPaper.enabled, false);
    const repeated = await request(`/api/morning-paper/unsubscribe?token=${encodeURIComponent(token)}`);
    assert.strictEqual(repeated.response.status, 200);

    console.log('dailyLoopRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
