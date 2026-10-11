const assert = require('assert');
const express = require('express');
const { buildMarketingFunnelRouter } = require('../marketingFunnelRoutes');

// Site-wide funnel numbers are for the admin list, never for any signed-in reader.
const run = async () => {
  process.env.FEEDBACK_ADMIN_USERNAMES = 'owner, second';
  const app = express();
  app.use(buildMarketingFunnelRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'u', username: req.headers['x-user'] };
      next();
    },
    buildMarketingFunnelSnapshot: async ({ days }) => ({ totals: { signupViewed: 3 }, days }),
    buildMarketingFunnelSeries: async ({ days }) => ({ series: [], days })
  }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const get = async (path, user) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: user ? { 'x-user': user } : {}
  });
  try {
    for (const path of ['/api/analytics/marketing/funnel', '/api/analytics/marketing/funnel/timeseries']) {
      assert.strictEqual((await get(path, 'reader')).status, 403, `${path} must refuse an ordinary reader`);
      assert.strictEqual((await get(path)).status, 403, `${path} must refuse a user without a username`);
      assert.strictEqual((await get(path, 'second')).status, 200, `${path} must answer an admin`);
    }
    assert.strictEqual((await (await get('/api/analytics/marketing/funnel?days=7', 'owner')).json()).totals.signupViewed, 3);

    process.env.FEEDBACK_ADMIN_USERNAMES = '';
    assert.strictEqual((await get('/api/analytics/marketing/funnel', 'owner')).status, 403, 'no list means no admins');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

run()
  .then(() => console.log('marketing funnel admin gate tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
