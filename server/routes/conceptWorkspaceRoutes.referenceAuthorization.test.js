const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const { buildConceptWorkspaceRouter } = require('./conceptWorkspaceRoutes');
const { ensureWorkspace, validateWorkspacePayload, applyPatchOp } = require('../utils/workspaceUtils');

const USER_ID = '64f300000000000000000001';
const CONCEPT_ID = '64f300000000000000000021';
const OWN_ARTICLE_ID = '64f300000000000000000031';
const FOREIGN_ARTICLE_ID = '64f300000000000000000032';

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const concept = {
  _id: CONCEPT_ID,
  name: 'Owned concept',
  workspace: ensureWorkspace({}),
  saveCount: 0,
  markModified() {},
  async save() { this.saveCount += 1; }
};

const resolveConceptByParam = async (userId, id) => (
  userId === USER_ID && id === CONCEPT_ID ? concept : null
);

const ownedQuery = (filter) => new Query(
  filter?._id === OWN_ARTICLE_ID && filter?.userId === USER_ID
    ? { _id: OWN_ARTICLE_ID, title: 'Canonical owned article' }
    : null
);

const app = express();
app.use(express.json());
app.use(buildConceptWorkspaceRouter({
  mongoose,
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer qa') return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: USER_ID };
    return next();
  },
  resolveConceptByParam,
  ensureWorkspace,
  toSafeObjectId: value => mongoose.Types.ObjectId.isValid(value) ? value : null,
  findHighlightById: async () => null,
  Article: { findOne: ownedQuery },
  NotebookEntry: { findOne: () => new Query(null) },
  Question: { findOne: () => new Query(null) },
  TagMeta: { findOne: () => new Query(null) },
  WikiPage: { findOne: () => new Query(null) },
  validateWorkspacePayload,
  applyPatchOp,
  executeWorkspaceActionsWithPolicy: async () => ({ status: 'applied' }),
  normalizeAgentActionFlow: value => value,
  normalizeAgentActorType: value => value,
  markTourSignal: async () => {}
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const request = async (path, method, body, { authorized = true } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (authorized) headers.Authorization = 'Bearer qa';
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: JSON.stringify(body)
    });
    return { response, body: await response.json() };
  };

  try {
    const unauthorized = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'GET', undefined, { authorized: false });
    assert.strictEqual(unauthorized.response.status, 401);

    concept.workspace = ensureWorkspace({});
    concept.workspace = applyPatchOp(concept.workspace, {
      op: 'addItem',
      payload: {
        type: 'article',
        refId: FOREIGN_ARTICLE_ID,
        groupId: 'working',
        stage: 'working',
        inlineTitle: 'Foreign title must not escape',
        inlineText: 'Foreign inline content must not escape'
      }
    });
    const savesBeforeGet = concept.saveCount;
    const sanitizedGet = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'GET');
    assert.strictEqual(sanitizedGet.response.status, 200);
    assert.strictEqual(sanitizedGet.body.workspace.items.length, 0);
    assert.doesNotMatch(JSON.stringify(sanitizedGet.body), /Foreign (title|inline content)/);
    assert.ok(concept.saveCount > savesBeforeGet, 'sanitized reload must persist removal of foreign references');

    const foreignWorkspace = ensureWorkspace({});
    foreignWorkspace.attachedItems = [{
      id: 'foreign-block',
      type: 'article',
      refId: FOREIGN_ARTICLE_ID,
      sectionId: 'working',
      groupId: 'working',
      parentId: '',
      stage: 'working',
      status: 'active',
      order: 0
    }];
    const savesBeforePut = concept.saveCount;
    const rejectedPut = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'PUT', { workspace: foreignWorkspace });
    assert.strictEqual(rejectedPut.response.status, 404);
    assert.match(rejectedPut.body.error, /not found for this user/i);
    assert.strictEqual(concept.saveCount, savesBeforePut, 'foreign full replacement must not persist');

    concept.workspace = ensureWorkspace({});
    concept.workspace = applyPatchOp(concept.workspace, {
      op: 'addItem',
      payload: { type: 'article', refId: OWN_ARTICLE_ID, groupId: 'working', stage: 'working' }
    });
    const blockId = concept.workspace.items[0].id;
    const rejectedPatch = await request(
      `/api/concepts/${CONCEPT_ID}/workspace/blocks/${blockId}`,
      'PATCH',
      { refId: FOREIGN_ARTICLE_ID }
    );
    assert.strictEqual(rejectedPatch.response.status, 404);
    assert.strictEqual(concept.workspace.items[0].refId, OWN_ARTICLE_ID, 'foreign block update must not mutate workspace');

    concept.workspace = ensureWorkspace({});
    const foreignPatchCases = [
      { type: 'article', refId: FOREIGN_ARTICLE_ID },
      { type: 'concept', refId: FOREIGN_ARTICLE_ID },
      { type: 'wiki_page', refId: FOREIGN_ARTICLE_ID },
      { type: 'wiki_claim', refId: `${FOREIGN_ARTICLE_ID}:claim-1` }
    ];
    for (const foreign of foreignPatchCases) {
      const rejectedGenericPatch = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'PATCH', {
        op: 'addItem',
        payload: {
          ...foreign,
          groupId: 'working',
          stage: 'working',
          inlineTitle: 'Untrusted title'
        }
      });
      assert.strictEqual(rejectedGenericPatch.response.status, 404, `${foreign.type} must fail closed`);
      assert.strictEqual(concept.workspace.items.length, 0, `${foreign.type} must not persist`);
    }

    const acceptedGenericPatch = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'PATCH', {
      op: 'addItem',
      payload: {
        type: 'article', refId: OWN_ARTICLE_ID, groupId: 'working', stage: 'working',
        inlineTitle: 'Spoofed title', inlineText: 'FABRICATED QUOTE'
      }
    });
    assert.strictEqual(acceptedGenericPatch.response.status, 200);
    assert.strictEqual(concept.workspace.items[0].refId, OWN_ARTICLE_ID);
    assert.strictEqual(concept.workspace.items[0].inlineTitle, 'Canonical owned article');
    assert.strictEqual(concept.workspace.items[0].inlineText, '');
    assert.doesNotMatch(JSON.stringify(acceptedGenericPatch.body), /Spoofed title|FABRICATED QUOTE/);

    const spoofedWorkspace = ensureWorkspace({ workspace: concept.workspace });
    spoofedWorkspace.items[0].inlineTitle = 'PUT spoof';
    spoofedWorkspace.items[0].inlineText = 'PUT fabricated quote';
    spoofedWorkspace.attachedItems = spoofedWorkspace.items;
    const canonicalPut = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'PUT', { workspace: spoofedWorkspace });
    assert.strictEqual(canonicalPut.response.status, 200);
    assert.doesNotMatch(JSON.stringify(canonicalPut.body), /PUT spoof|PUT fabricated quote/);
    concept.workspace.items[0].inlineTitle = 'Stored spoof';
    concept.workspace.items[0].inlineText = 'Stored fabricated quote';
    concept.workspace.attachedItems = concept.workspace.items;
    const canonicalReload = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'GET');
    assert.strictEqual(canonicalReload.response.status, 200);
    assert.doesNotMatch(JSON.stringify(canonicalReload.body), /Stored spoof|Stored fabricated quote/);
    const savesAfterCanonicalReload = concept.saveCount;
    const idempotentReload = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'GET');
    assert.strictEqual(idempotentReload.response.status, 200);
    assert.strictEqual(concept.saveCount, savesAfterCanonicalReload, 'canonical GET must not write');

    const ownedBlockId = concept.workspace.items[0].id;
    const rejectedDirectUpdate = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'PATCH', {
      op: 'updateItem',
      payload: { itemId: ownedBlockId, type: 'wiki_page', refId: FOREIGN_ARTICLE_ID }
    });
    assert.strictEqual(rejectedDirectUpdate.response.status, 404);
    assert.strictEqual(concept.workspace.items[0].refId, OWN_ARTICLE_ID);

    const canonicalInlineUpdate = await request(`/api/concepts/${CONCEPT_ID}/workspace`, 'PATCH', {
      op: 'updateItem',
      payload: { itemId: ownedBlockId, patch: { inlineTitle: 'Nested spoof', inlineText: 'FABRICATED QUOTE' } }
    });
    assert.strictEqual(canonicalInlineUpdate.response.status, 200);
    assert.doesNotMatch(JSON.stringify(canonicalInlineUpdate.body), /Nested spoof|FABRICATED QUOTE/);

    concept.workspace = ensureWorkspace({});
    const attachPath = `/api/concepts/${CONCEPT_ID}/workspace/blocks/attach`;
    const firstAttach = await request(attachPath, 'POST', {
      type: 'article', refId: OWN_ARTICLE_ID, sectionId: 'working', stage: 'working',
      inlineTitle: 'Attach spoof', inlineText: 'Attach fabricated quote'
    });
    assert.strictEqual(firstAttach.response.status, 201);
    assert.doesNotMatch(JSON.stringify(firstAttach.body), /Attach spoof|Attach fabricated quote/);
    const secondAttach = await request(attachPath, 'POST', {
      type: 'article', refId: OWN_ARTICLE_ID, sectionId: 'working', stage: 'working'
    });
    assert.strictEqual(secondAttach.response.status, 200);
    assert.strictEqual(secondAttach.body.reused, true);
    assert.strictEqual(concept.workspace.items.length, 1, 'retry must reuse the exact attached block');

    console.log('conceptWorkspaceRoutes reference authorization tests passed');
  } finally {
    server.close();
  }
});
