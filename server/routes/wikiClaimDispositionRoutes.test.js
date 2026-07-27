const assert = require('assert');
const express = require('express');
const {
  buildWikiClaimDispositionRouter
} = require('./wikiClaimDispositionRoutes');
const { WikiClaimDispositionError } = require('../services/wikiClaimDispositionService');

const USER_ID = '64f300000000000000000001';
const REVISION_ID = '64f300000000000000000031';

const calls = [];
const readCalls = [];
const app = express();
app.use(express.json());
app.use(buildWikiClaimDispositionRouter({
  authenticateToken: (req, _res, next) => {
    if (req.headers.authorization !== 'Bearer missing-user') req.user = { id: USER_ID };
    if (req.headers.authorization === 'Bearer agent') {
      req.agentToken = { id: 'agent-1' };
      req.authInfo = { tokenSource: 'agent-token' };
    }
    if (req.headers.authorization === 'Bearer personal') {
      req.personalAgent = { id: 'personal-1' };
    }
    next();
  },
  loadRepoClaimReviewQueue: async input => {
    readCalls.push(input);
    if (input.pageId === '64f300000000000000000099') {
      const { WikiRepoClaimReviewError } = require('../services/wikiRepoClaimReviewService');
      throw new WikiRepoClaimReviewError('Wiki page not found.', 404, 'not_found');
    }
    return { version: 1, activeCohortId: 'cohort-1', cohorts: [] };
  },
  disposeWikiClaimCandidate: async input => {
    calls.push(input);
    if (input.action === 'reject') {
      throw new WikiClaimDispositionError('Already accepted.', 409, 'already_disposed');
    }
    return {
      idempotent: false,
      state: 'accepted',
      page: { _id: '64f300000000000000000021' },
      revision: { pageId: '64f300000000000000000021' },
      receipt: { id: 'receipt-1' }
    };
  }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const request = async (revisionId, body, token = 'human') => {
    const response = await fetch(`http://127.0.0.1:${port}/api/wiki/revisions/${revisionId}/disposition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    return { response, body: await response.json() };
  };
  const read = async (pageId, token = 'human') => {
    const response = await fetch(`http://127.0.0.1:${port}/api/wiki/pages/${pageId}/repo-claim-candidates`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return { response, body: await response.json() };
  };
  try {
    const invalidRead = await read('bad-id');
    assert.strictEqual(invalidRead.response.status, 400);

    for (const token of ['agent', 'personal']) {
      const deniedRead = await read('64f300000000000000000021', token);
      assert.strictEqual(deniedRead.response.status, 403);
    }
    const missingUserRead = await read('64f300000000000000000021', 'missing-user');
    assert.strictEqual(missingUserRead.response.status, 401);
    assert.strictEqual(missingUserRead.body.code, 'AUTH_REQUIRED');
    assert.strictEqual(readCalls.length, 0);

    const loaded = await read('64f300000000000000000021');
    assert.strictEqual(loaded.response.status, 200);
    assert.strictEqual(loaded.body.activeCohortId, 'cohort-1');
    assert.strictEqual(readCalls[0].userId, USER_ID);

    const missing = await read('64f300000000000000000099');
    assert.strictEqual(missing.response.status, 404);
    assert.strictEqual(missing.body.code, 'not_found');

    const invalid = await request('bad-id', { action: 'accept' });
    assert.strictEqual(invalid.response.status, 400);

    const agent = await request(REVISION_ID, { action: 'accept' }, 'agent');
    assert.strictEqual(agent.response.status, 403);
    assert.strictEqual(calls.length, 0);
    const personalMutation = await request(REVISION_ID, { action: 'accept' }, 'personal');
    assert.strictEqual(personalMutation.response.status, 403);
    assert.strictEqual(calls.length, 0);
    const missingUserMutation = await request(
      REVISION_ID,
      { action: 'accept' },
      'missing-user'
    );
    assert.strictEqual(missingUserMutation.response.status, 401);
    assert.strictEqual(missingUserMutation.body.code, 'AUTH_REQUIRED');
    assert.strictEqual(calls.length, 0);

    const accepted = await request(REVISION_ID, { action: 'accept', note: 'Human decision' });
    assert.strictEqual(accepted.response.status, 200);
    assert.strictEqual(accepted.body.state, 'accepted');
    assert.strictEqual(calls[0].userId, USER_ID);
    assert.strictEqual(calls[0].revisionId, REVISION_ID);

    const conflict = await request(REVISION_ID, { action: 'reject' });
    assert.strictEqual(conflict.response.status, 409);
    assert.strictEqual(conflict.body.code, 'already_disposed');

    console.log('wikiClaimDispositionRoutes tests passed');
  } finally {
    server.close();
  }
});
