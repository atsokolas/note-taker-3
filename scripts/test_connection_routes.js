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

const listConnections = async (itemType, itemId) => {
  const params = new URLSearchParams({ itemType, itemId });
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

const run = async () => {
  const a = await createNotebookEntry(`Connection test A ${Date.now()}`);
  const b = await createNotebookEntry(`Connection test B ${Date.now()}`);

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

    const duplicate = await createConnection(payload);
    assert.strictEqual(duplicate.status, 409, 'duplicate connection should return 409');

    const listed = await listConnections('notebook', a._id);
    assert.ok(Array.isArray(listed.outgoing), 'outgoing should be an array');
    assert.ok(listed.outgoing.some(item => String(item._id) === String(created.body._id)), 'created connection missing in outgoing list');

    await deleteConnection(created.body._id);
    const afterDelete = await listConnections('notebook', a._id);
    assert.ok(!afterDelete.outgoing.some(item => String(item._id) === String(created.body._id)), 'deleted connection still listed');
  } finally {
    await deleteNotebookEntry(a._id);
    await deleteNotebookEntry(b._id);
  }

  console.log('connection route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
