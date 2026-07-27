const assert = require('assert');
const express = require('express');
const {
  buildConceptContinuityRouter,
  isObjectId
} = require('./conceptContinuityRoutes');

const USER_ID = '64f300000000000000000001';
const PAGE_ID = '64f300000000000000000011';
const REVISION_ID = '64f300000000000000000012';
const CONCEPT_ID = '64f300000000000000000021';

class Query {
  constructor(value) { this.value = value; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const query = value => new Query(value);
const page = {
  _id: PAGE_ID,
  userId: USER_ID,
  title: 'Maintained thesis',
  status: 'active',
  claims: [{ claimId: 'claim-1', text: 'A bounded claim.' }],
  sourceRefs: [{ type: 'article', id: 'source-1' }],
  plainText: 'A real Wiki page with sufficient content for the investigation continuity route.'
};
const revision = {
  _id: REVISION_ID,
  userId: USER_ID,
  pageId: PAGE_ID,
  after: { claims: [{ claimId: 'claim-1', text: 'A bounded candidate claim.' }] }
};
const concept = {
  _id: CONCEPT_ID,
  userId: USER_ID,
  name: `Investigation · Maintained thesis · ${PAGE_ID.slice(-6)}`,
  isPublic: false,
  continuityAnchor: {
    kind: 'wiki_investigation',
    objectType: 'wiki_page',
    objectId: PAGE_ID
  }
};

const writes = [];
let routeMode = 'create';
const app = express();
app.use(express.json());
app.use(buildConceptContinuityRouter({
  authenticateToken: (req, res, next) => {
    if (!['Bearer qa', 'Bearer agent', 'Bearer personal', 'Bearer missing-user'].includes(req.headers.authorization)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.headers.authorization !== 'Bearer missing-user') req.user = { id: USER_ID };
    if (req.headers.authorization === 'Bearer agent') {
      req.agentToken = { id: 'agent-1' };
      req.authInfo = { tokenSource: 'agent-token' };
    }
    if (req.headers.authorization === 'Bearer personal') req.personalAgent = { id: 'personal-1' };
    return next();
  },
  WikiPage: { findOne: () => query(page) },
  WikiRevision: { findOne: () => query(revision) },
  TagMeta: {
    findOne: filter => {
      if (routeMode === 'explode') throw new Error('database detail must stay private');
      if (routeMode === 'reuse' && filter?.['continuityAnchor.objectId']) return query(concept);
      return query(null);
    },
    findOneAndUpdate: async (filter, update, options) => {
      writes.push({ filter, update, options });
      return { value: concept, lastErrorObject: { updatedExisting: false, upserted: CONCEPT_ID } };
    }
  }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const request = async (path, { authorized = true, authToken = 'qa', body } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (authorized) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {})
    });
    return { response, body: await response.json() };
  };
  const path = `/api/wiki/pages/${PAGE_ID}/investigation`;

  try {
    const unauthorized = await request(path, { authorized: false });
    assert.strictEqual(unauthorized.response.status, 401);

    const missingUser = await request(path, { authToken: 'missing-user' });
    assert.strictEqual(missingUser.response.status, 401);
    assert.strictEqual(missingUser.body.code, 'AUTH_REQUIRED');
    assert.strictEqual(writes.length, 0);

    for (const authToken of ['agent', 'personal']) {
      const denied = await request(path, { authToken });
      assert.strictEqual(denied.response.status, 403);
      assert.strictEqual(denied.body.code, 'HUMAN_OWNER_REQUIRED');
    }

    const badPage = await request('/api/wiki/pages/not-an-id/investigation');
    assert.strictEqual(badPage.response.status, 400);
    assert.match(badPage.body.error, /wikiPageId.*valid object id/i);

    const badRevision = await request(path, { body: { revisionId: 'not-an-id' } });
    assert.strictEqual(badRevision.response.status, 400);
    assert.match(badRevision.body.error, /revisionId.*valid object id/i);

    const longClaim = await request(path, { body: { claimId: 'x'.repeat(241) } });
    assert.strictEqual(longClaim.response.status, 400);
    assert.match(longClaim.body.error, /claimId is too long/i);
    for (const claimId of ['', '   ', [], {}, 42]) {
      const malformedClaim = await request(path, { body: { claimId } });
      assert.strictEqual(malformedClaim.response.status, 400);
    }
    assert.strictEqual(writes.length, 0, 'invalid claim ids must fail before model writes');
    assert.strictEqual(isObjectId(PAGE_ID), true);
    assert.strictEqual(isObjectId('not-an-id'), false);

    // Caller-supplied authority and content are ignored; the server uses auth and owned models.
    const created = await request(path, {
      body: {
        revisionId: REVISION_ID,
        claimId: 'claim-1',
        userId: '64f300000000000000000099',
        name: 'Attacker-controlled title',
        isPublic: true,
        pinnedArticleIds: ['64f300000000000000000099'],
        ideaWorkbench: { hypothesis: { html: '<script>bad()</script>' } }
      }
    });
    assert.strictEqual(created.response.status, 201, JSON.stringify(created.body));
    assert.strictEqual(created.body.created, true);
    assert.strictEqual(created.body.concept.id, CONCEPT_ID);
    assert.deepStrictEqual(Object.keys(created.body).sort(), ['concept', 'continuity', 'created']);
    assert.deepStrictEqual(Object.keys(created.body.concept).sort(), ['href', 'id', 'title', 'type']);
    assert.strictEqual(created.body.concept.type, 'concept');
    assert.ok(!JSON.stringify(created.body).includes('Attacker-controlled'));
    assert.ok(!JSON.stringify(created.body).includes('script'));
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(writes[0].filter.userId, USER_ID);
    assert.strictEqual(writes[0].update.$setOnInsert.isPublic, false);
    assert.ok(!JSON.stringify(writes[0].update).includes('pinnedArticleIds'));

    routeMode = 'reuse';
    const reused = await request(path, { body: { claimId: 'claim-1' } });
    assert.strictEqual(reused.response.status, 200);
    assert.strictEqual(reused.body.created, false);
    assert.strictEqual(writes.length, 1, 'anchored reuse must not write');

    const missingClaim = await request(path, { body: { claimId: 'missing-claim' } });
    assert.strictEqual(missingClaim.response.status, 404);
    assert.strictEqual(missingClaim.body.code, 'not_found');
    assert.match(missingClaim.body.error, /claim not found/i);

    routeMode = 'explode';
    const originalConsoleError = console.error;
    console.error = () => {};
    const internalFailure = await request(path);
    console.error = originalConsoleError;
    assert.strictEqual(internalFailure.response.status, 500);
    assert.deepStrictEqual(internalFailure.body, { error: 'Failed to start Wiki investigation.' });
    assert.ok(!JSON.stringify(internalFailure.body).includes('database detail'));

    console.log('concept continuity routes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
