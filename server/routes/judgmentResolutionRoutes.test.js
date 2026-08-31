const assert = require('assert');
const express = require('express');
const { buildJudgmentResolutionRouter } = require('./judgmentResolutionRoutes');

const PAGE_ID = '64f500000000000000000010';
const calls = [];
const app = express();
app.use(express.json());
app.use(buildJudgmentResolutionRouter({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'user-1' };
    if (req.headers.authorization === 'Bearer agent') req.agentToken = { id: 'agent' };
    next();
  },
  setResolutionCriteria: async input => {
    calls.push(['criteria', input]);
    return { page: { _id: PAGE_ID, judgment: { resolutionCriteria: input.criteria } }, artifact: {}, receipt: {}, idempotent: false };
  },
  recordVerdict: async input => {
    calls.push(['verdict', input]);
    return { page: { _id: PAGE_ID, judgment: { verdicts: [{ result: input.result }] } }, artifact: {}, receipt: {}, idempotent: false };
  },
  buildJudgmentMirror: async input => { calls.push(['mirror', input]); return { metrics: { claimsHeld: 1 } }; },
  buildJudgmentAudit: async input => { calls.push(['audit', input]); return { summary: { status: 'quiet' }, events: [] }; }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = 'GET', body, token = 'human' } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { response, body: await response.json() };
  };
  try {
    assert.strictEqual((await request(`/api/judgment/pages/${PAGE_ID}/resolution`, { method: 'POST', body: {}, token: 'agent' })).response.status, 403);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual((await request('/api/judgment/pages/bad/resolution', { method: 'POST', body: {} })).response.status, 400);
    assert.strictEqual((await request(`/api/judgment/pages/${PAGE_ID}/resolution`, { method: 'POST', body: { criteria: 'x' } })).response.status, 201);
    assert.strictEqual((await request(`/api/judgment/pages/${PAGE_ID}/verdicts`, { method: 'POST', body: { result: 'held_up' } })).response.status, 201);
    const mirror = await request('/api/judgment/mirror');
    assert.strictEqual(mirror.response.status, 200);
    assert.strictEqual(mirror.body.mirror.metrics.claimsHeld, 1);
    const audit = await request('/api/judgment/audit');
    assert.strictEqual(audit.response.status, 200);
    assert.strictEqual(audit.body.audit.summary.status, 'quiet');
    assert.deepStrictEqual(calls.map(call => call[0]), ['criteria', 'verdict', 'mirror', 'audit']);
    console.log('judgmentResolutionRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
