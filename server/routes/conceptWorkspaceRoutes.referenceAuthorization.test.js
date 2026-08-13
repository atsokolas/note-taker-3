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
  filter?._id === OWN_ARTICLE_ID && filter?.userId === USER_ID ? { _id: OWN_ARTICLE_ID } : null
);

const app = express();
app.use(express.json());
app.use(buildConceptWorkspaceRouter({
  mongoose,
  authenticateToken: (req, _res, next) => { req.user = { id: USER_ID }; next(); },
  resolveConceptByParam,
  ensureWorkspace,
  toSafeObjectId: value => mongoose.Types.ObjectId.isValid(value) ? value : null,
  findHighlightById: async () => null,
  Article: { findOne: ownedQuery },
  NotebookEntry: { findOne: () => new Query(null) },
  Question: { findOne: () => new Query(null) },
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
  const request = async (path, method, body) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { response, body: await response.json() };
  };

  try {
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
    const attachPath = `/api/concepts/${CONCEPT_ID}/workspace/blocks/attach`;
    const firstAttach = await request(attachPath, 'POST', {
      type: 'article', refId: OWN_ARTICLE_ID, sectionId: 'working', stage: 'working'
    });
    assert.strictEqual(firstAttach.response.status, 201);
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
