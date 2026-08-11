const assert = require('assert');
const express = require('express');
const { buildDecisionMutationRouter } = require('./decisionMutationRoutes');
const { DecisionMutationError } = require('../services/decisionMutationService');

const PAGE_ID = '64f500000000000000000010';
const REVISION_ID = '64f500000000000000000020';
const calls = [];
const result = {
  idempotent: false,
  page: { _id: PAGE_ID },
  decision: { decisionId: 'decision-1', status: 'taken', acceptedRevisionId: REVISION_ID, immutableSnapshotHash: 'hash' },
  receipt: { id: 'receipt-1' }
};
const app = express();
app.use(express.json());
app.use(buildDecisionMutationRouter({
  authenticateToken: (req, _res, next) => {
    if (req.headers.authorization !== 'Bearer missing-user') req.user = { id: 'user-1' };
    if (req.headers.authorization === 'Bearer agent') req.agentToken = { id: 'agent' };
    if (req.headers.authorization === 'Bearer personal') req.personalAgent = { id: 'personal' };
    next();
  },
  createAcceptedDecision: async input => { calls.push(['create', input]); return result; },
  transitionDecision: async input => { calls.push(['transition', input]); return { ...result, decision: { ...result.decision, status: 'cancelled' } }; },
  recordDecisionOutcome: async input => {
    calls.push(['outcome', input]);
    if (input.decisionId === 'conflict') throw new DecisionMutationError('conflict', 409, 'outcome_conflict');
    return { ...result, decision: { ...result.decision, status: 'reviewed' } };
  }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, token = 'human') => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body)
    });
    return { response, body: await response.json() };
  };
  try {
    assert.strictEqual((await post(`/api/wiki/pages/${PAGE_ID}/decisions`, { acceptedRevisionId: REVISION_ID }, 'agent')).response.status, 403);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual((await post(
      `/api/wiki/pages/${PAGE_ID}/decisions`,
      { acceptedRevisionId: REVISION_ID },
      'personal'
    )).response.status, 403);
    assert.strictEqual((await post(
      `/api/wiki/pages/${PAGE_ID}/decisions/decision-1/transition`,
      { action: 'cancel' },
      'personal'
    )).response.status, 403);
    assert.strictEqual((await post(
      `/api/wiki/pages/${PAGE_ID}/decisions/decision-1/outcome`,
      { outcome: {} },
      'personal'
    )).response.status, 403);
    assert.strictEqual(calls.length, 0);
    const missingUser = await post(
      `/api/wiki/pages/${PAGE_ID}/decisions`,
      { acceptedRevisionId: REVISION_ID },
      'missing-user'
    );
    assert.strictEqual(missingUser.response.status, 401);
    assert.strictEqual(missingUser.body.code, 'AUTH_REQUIRED');
    assert.strictEqual(calls.length, 0);
    assert.strictEqual((await post('/api/wiki/pages/bad/decisions', { acceptedRevisionId: REVISION_ID })).response.status, 400);
    const created = await post(`/api/wiki/pages/${PAGE_ID}/decisions`, { acceptedRevisionId: REVISION_ID, requestId: 'one', decision: { summary: 'x' } });
    assert.strictEqual(created.response.status, 201);
    assert.strictEqual(created.body.decisionId, 'decision-1');
    assert.strictEqual(created.body.acceptedRevisionId, REVISION_ID);
    assert.strictEqual((await post(`/api/wiki/pages/${PAGE_ID}/decisions/decision-1/transition`, { action: 'cancel' })).body.status, 'cancelled');
    assert.strictEqual((await post(`/api/wiki/pages/${PAGE_ID}/decisions/decision-1/outcome`, { outcome: {} })).body.status, 'reviewed');
    const conflict = await post(`/api/wiki/pages/${PAGE_ID}/decisions/conflict/outcome`, { outcome: {} });
    assert.strictEqual(conflict.response.status, 409);
    assert.strictEqual(conflict.body.code, 'outcome_conflict');
    console.log('decisionMutationRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
