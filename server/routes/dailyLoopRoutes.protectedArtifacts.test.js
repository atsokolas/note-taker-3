const assert = require('node:assert/strict');
const express = require('express');
const { buildDailyLoopRouter } = require('./dailyLoopRoutes');

const run = async () => {
  let pageLookups = 0;
  let pageSaves = 0;
  const protectedPage = {
    _id: '507f1f77bcf86cd799439099',
    userId: '507f1f77bcf86cd799439010',
    createdFrom: { label: 'research-ledger:2026-07:507f1f77bcf86cd799439011' },
    async save() { pageSaves += 1; }
  };
  const WikiPage = {
    findOne() {
      pageLookups += 1;
      return {
        select() { return this; },
        async lean() { return protectedPage; },
        then(resolve, reject) { return Promise.resolve(protectedPage).then(resolve, reject); }
      };
    }
  };
  const app = express();
  app.use(express.json());
  app.use(buildDailyLoopRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: protectedPage.userId };
      req.agentToken = { id: 'agent-token-1' };
      next();
    },
    WikiPage
  }));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of [
      `/api/daily-loop/check-ins/${protectedPage._id}/claim-1`,
      `/api/wiki/pages/${protectedPage._id}/reading-watch`,
      `/api/wiki/pages/${protectedPage._id}/reading-watch/check`,
      `/api/daily-loop/watchers/${protectedPage._id}/reading/disarm`
    ]) {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reaffirmed', feedUrl: 'https://example.com/feed' })
      });
      assert.equal(response.status, 403, path);
      assert.match((await response.json()).error, /human owner/);
    }
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  assert.equal(pageLookups, 4);
  assert.equal(pageSaves, 0);
  console.log('dailyLoopRoutes protected artifact tests passed');
};

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
