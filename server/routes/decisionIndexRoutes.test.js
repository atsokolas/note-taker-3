const assert = require('assert');
const express = require('express');
const { buildDecisionIndexRouter } = require('./decisionIndexRoutes');
const { DecisionIndexError } = require('../services/decisionIndexService');

const USER_ID = '64f500000000000000000001';
const calls = [];
const app = express();
app.use(buildDecisionIndexRouter({
  authenticateToken: (req, _res, next) => {
    if (req.headers.authorization !== 'Bearer missing-user') req.user = { id: USER_ID };
    if (req.headers.authorization === 'Bearer agent') req.agentToken = { id: 'agent' };
    if (req.headers.authorization === 'Bearer personal') req.personalAgent = { id: 'personal' };
    next();
  },
  buildDecisionIndex: async input => {
    calls.push(input);
    if (input.cursor === 'bad') throw new DecisionIndexError('cursor is invalid.', 400, 'invalid_cursor');
    return {
      items: [{ id: 'decision:page:one' }],
      nextCursor: null,
      asOf: '2026-08-01T12:00:00.000Z',
      counts: { all: 1, upcoming_review: 1, awaiting_outcome: 0, reviewed: 0 },
      coverage: { scannedPages: 1, truncated: false }
    };
  }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, token = 'human') => {
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { response, body: await response.json() };
  };
  try {
    const agent = await request('/api/decisions', 'agent');
    assert.strictEqual(agent.response.status, 403);
    assert.strictEqual(calls.length, 0);
    const personal = await request('/api/decisions', 'personal');
    assert.strictEqual(personal.response.status, 403);
    assert.strictEqual(calls.length, 0);
    const missingUser = await request('/api/decisions', 'missing-user');
    assert.strictEqual(missingUser.response.status, 401);
    assert.strictEqual(missingUser.body.code, 'AUTH_REQUIRED');
    assert.strictEqual(calls.length, 0);

    assert.strictEqual((await request('/api/decisions?filter=wrong')).response.status, 400);
    assert.strictEqual((await request('/api/decisions?limit=zero')).response.status, 400);
    assert.strictEqual((await request('/api/decisions?windowDays=0')).response.status, 400);
    assert.strictEqual((await request('/api/decisions?pageId=bad')).response.status, 400);

    const ok = await request('/api/decisions?filter=upcoming_review&limit=5&windowDays=45&pageId=64f500000000000000000010');
    assert.strictEqual(ok.response.status, 200);
    assert.strictEqual(ok.body.items.length, 1);
    assert.strictEqual(ok.body.filters.filter, 'upcoming_review');
    assert.strictEqual(ok.body.filters.windowDays, 45);
    assert.strictEqual(ok.body.filters.asOf, '2026-08-01T12:00:00.000Z');
    assert.strictEqual(ok.body.generatedAt, ok.body.filters.asOf);
    assert.strictEqual(calls[0].userId, USER_ID);

    const invalidCursor = await request('/api/decisions?cursor=bad');
    assert.strictEqual(invalidCursor.response.status, 400);
    assert.strictEqual(invalidCursor.body.code, 'invalid_cursor');
    console.log('decisionIndexRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
