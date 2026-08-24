const assert = require('assert');
const express = require('express');
const { buildSystemLoopRouter } = require('./systemLoopRoutes');

class Query {
  constructor(value) { this.value = value; }
  sort() { return this; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const emptyModel = {
  findOne: () => new Query(null),
  countDocuments: () => Promise.resolve(0)
};

const app = express();
app.use(buildSystemLoopRouter({
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer qa') return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: '64f600000000000000000001' };
    return next();
  },
  WikiMaintenanceRun: emptyModel,
  WikiBriefingCache: emptyModel,
  MorningPaperDelivery: emptyModel,
  WikiPage: emptyModel,
  NoeisReceipt: emptyModel
}));

const server = app.listen(0, '127.0.0.1', async () => {
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const unauthorized = await fetch(`${base}/api/system/loops`);
    assert.strictEqual(unauthorized.status, 401);

    const response = await fetch(`${base}/api/system/loops`, { headers: { Authorization: 'Bearer qa' } });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assert.strictEqual(body.schemaVersion, 1);
    assert.strictEqual(Object.keys(body.loops).length, 4);
    assert.strictEqual(body.loops['loop.outcome-review'].status, 'idle');
    console.log('systemLoopRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
