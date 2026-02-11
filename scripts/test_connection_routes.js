#!/usr/bin/env node
const assert = require('assert');

const baseUrl = (process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const token = process.env.AUTH_TOKEN || '';

if (!token) {
  console.error('AUTH_TOKEN is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};

const createNotebookEntry = async (title) => {
  const res = await fetch(`${baseUrl}/api/notebook`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, content: title, blocks: [] })
  });
  const text = await res.text();
  assert.strictEqual(res.status, 201, `create notebook failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const deleteNotebookEntry = async (id) => {
  const res = await fetch(`${baseUrl}/api/notebook/${id}`, {
    method: 'DELETE',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `delete notebook failed status=${res.status} body=${text}`);
};

const createConnection = async (payload) => {
  const res = await fetch(`${baseUrl}/api/connections`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const listConnections = async (itemType, itemId, scope = {}) => {
  const params = new URLSearchParams({ itemType, itemId });
  if (scope.scopeType) params.set('scopeType', scope.scopeType);
  if (scope.scopeId) params.set('scopeId', scope.scopeId);
  const res = await fetch(`${baseUrl}/api/connections?${params.toString()}`, {
    method: 'GET',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `list connections failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const deleteConnection = async (id) => {
  const res = await fetch(`${baseUrl}/api/connections/${id}`, {
    method: 'DELETE',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `delete connection failed status=${res.status} body=${text}`);
};

const listScopeConnections = async (scopeType, scopeId) => {
  const params = new URLSearchParams({ scopeType, scopeId });
  const res = await fetch(`${baseUrl}/api/connections/scope?${params.toString()}`, {
    method: 'GET',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `list scope connections failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const createQuestion = async (text) => {
  const res = await fetch(`${baseUrl}/api/questions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, status: 'open' })
  });
  const bodyText = await res.text();
  assert.strictEqual(res.status, 201, `create question failed status=${res.status} body=${bodyText}`);
  return JSON.parse(bodyText);
};

const upsertConcept = async (name) => {
  const res = await fetch(`${baseUrl}/api/concepts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ description: `test concept ${name}` })
  });
  const bodyText = await res.text();
  assert.strictEqual(res.status, 200, `upsert concept failed status=${res.status} body=${bodyText}`);
  return JSON.parse(bodyText);
};

const deleteQuestion = async (id) => {
  const res = await fetch(`${baseUrl}/api/questions/${id}`, {
    method: 'DELETE',
    headers
  });
  const bodyText = await res.text();
  assert.strictEqual(res.status, 200, `delete question failed status=${res.status} body=${bodyText}`);
};

const run = async () => {
  const a = await createNotebookEntry(`Connection test A ${Date.now()}`);
  const b = await createNotebookEntry(`Connection test B ${Date.now()}`);
  const question = await createQuestion(`Connection scope test ${Date.now()}`);
  const conceptA = await upsertConcept(`Connection Concept A ${Date.now()}`);
  const conceptB = await upsertConcept(`Connection Concept B ${Date.now() + 1}`);
  const cleanupConnectionIds = [];

  try {
    const payload = {
      fromType: 'notebook',
      fromId: a._id,
      toType: 'notebook',
      toId: b._id,
      relationType: 'supports'
    };
    const created = await createConnection(payload);
    assert.strictEqual(created.status, 201, `create connection failed body=${JSON.stringify(created.body)}`);
    assert.ok(created.body?._id, 'connection _id missing');
    cleanupConnectionIds.push(created.body._id);

    const duplicate = await createConnection(payload);
    assert.strictEqual(duplicate.status, 409, 'duplicate connection should return 409');

    const listed = await listConnections('notebook', a._id);
    assert.ok(Array.isArray(listed.outgoing), 'outgoing should be an array');
    assert.ok(listed.outgoing.some(item => String(item._id) === String(created.body._id)), 'created connection missing in outgoing list');

    await deleteConnection(created.body._id);
    cleanupConnectionIds.pop();
    const afterDelete = await listConnections('notebook', a._id);
    assert.ok(!afterDelete.outgoing.some(item => String(item._id) === String(created.body._id)), 'deleted connection still listed');

    const scopedPayload = {
      ...payload,
      scopeType: 'question',
      scopeId: question._id
    };
    const scopedCreate = await createConnection(scopedPayload);
    assert.strictEqual(scopedCreate.status, 201, `create scoped connection failed body=${JSON.stringify(scopedCreate.body)}`);
    cleanupConnectionIds.push(scopedCreate.body._id);

    const scopedDuplicate = await createConnection(scopedPayload);
    assert.strictEqual(scopedDuplicate.status, 409, 'duplicate scoped connection should return 409');

    const scopedListed = await listConnections('notebook', a._id, {
      scopeType: 'question',
      scopeId: question._id
    });
    assert.ok(scopedListed.outgoing.some(item => String(item._id) === String(scopedCreate.body._id)), 'scoped connection missing from scoped list');

    const scopeRows = await listScopeConnections('question', question._id);
    assert.ok(Array.isArray(scopeRows.connections), 'scope connections should be an array');
    assert.ok(scopeRows.connections.some(row => String(row._id) === String(scopedCreate.body._id)), 'scoped connection missing from scope endpoint');

    const conceptConnection = await createConnection({
      fromType: 'concept',
      fromId: conceptA._id,
      toType: 'concept',
      toId: conceptB._id,
      relationType: 'extends'
    });
    assert.strictEqual(conceptConnection.status, 201, `concept connection failed body=${JSON.stringify(conceptConnection.body)}`);
    cleanupConnectionIds.push(conceptConnection.body._id);

    const conceptListed = await listConnections('concept', conceptA._id);
    assert.ok(
      conceptListed.outgoing.some(item => String(item._id) === String(conceptConnection.body._id)),
      'concept connection missing from concept outgoing list'
    );
  } finally {
    for (const connectionId of cleanupConnectionIds) {
      try {
        await deleteConnection(connectionId);
      } catch (error) {
        // no-op cleanup
      }
    }
    await deleteQuestion(question._id);
    await deleteNotebookEntry(a._id);
    await deleteNotebookEntry(b._id);
  }

  console.log('connection route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
