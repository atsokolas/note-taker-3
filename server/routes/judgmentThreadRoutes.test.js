const assert = require('assert');
const express = require('express');
const { buildJudgmentThreadRouter } = require('./judgmentThreadRoutes');

const PAGE_ID = '64f500000000000000000010';
const OBSERVATION_ID = 'company-dossier-judgment-review:case:revision';
const calls = [];
const app = express();
app.use(express.json());
app.use(buildJudgmentThreadRouter({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'user-1' };
    if (req.headers.authorization === 'Bearer agent') req.agentToken = { id: 'agent' };
    next();
  },
  readThread: async input => {
    calls.push(['read', input]);
    return { draft: null, observation: { id: input.observationId } };
  },
  saveThread: async input => {
    calls.push(['save', input]);
    return { draft: { response: input.response, version: 1 } };
  },
  proposeLineage: async input => {
    calls.push(['propose-lineage', input]);
    return { familyId: input.familyId, status: 'proposed', version: 0 };
  },
  reviewLineage: async input => {
    calls.push(['review-lineage', input]);
    return { familyId: input.familyId, status: 'accepted', version: 1 };
  }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, path, body, token = 'human') => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { response, body: await response.json() };
  };
  const path = `/api/judgment/pages/${PAGE_ID}/observations/${encodeURIComponent(OBSERVATION_ID)}/thread`;
  try {
    assert.strictEqual((await request('GET', path, null, 'agent')).response.status, 403);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual((await request('GET', path)).response.status, 200);
    assert.strictEqual((await request('PUT', path, { response: 'uncertain' })).response.status, 200);
    assert.deepStrictEqual(calls.map(call => call[0]), ['read', 'save']);
    assert.strictEqual(calls[1][1].userId, 'user-1');
    assert.strictEqual(calls[1][1].observationId, OBSERVATION_ID);
    const proposalPath = '/api/judgment/source-lineage/proposals';
    assert.strictEqual((await request('POST', proposalPath, {
      familyId: 'family-1',
      members: [{ sourceEventId: '64f500000000000000000011' }, { sourceEventId: '64f500000000000000000012' }]
    }, 'agent')).response.status, 200);
    assert.strictEqual(calls[2][1].proposedBy, 'agent');
    const reviewPath = '/api/judgment/source-lineage/family-1/accept';
    assert.strictEqual((await request('POST', reviewPath, { expectedVersion: 0 }, 'agent')).response.status, 403);
    assert.strictEqual((await request('POST', reviewPath, { expectedVersion: 0 })).response.status, 200);
    assert.strictEqual(calls[3][0], 'review-lineage');
    console.log('judgmentThreadRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
