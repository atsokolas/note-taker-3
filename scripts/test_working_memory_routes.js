#!/usr/bin/env node
const assert = require('assert');

const baseUrl = (process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const token = process.env.AUTH_TOKEN || '';
const workspaceType = process.env.WM_WORKSPACE_TYPE || 'notebook';
const workspaceId = process.env.WM_WORKSPACE_ID || 'test-workspace';

if (!token) {
  console.error('AUTH_TOKEN is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};

const listItems = async () => {
  const params = new URLSearchParams({ workspaceType, workspaceId });
  const res = await fetch(`${baseUrl}/api/working-memory?${params.toString()}`, {
    method: 'GET',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `List failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const createItem = async () => {
  const payload = {
    workspaceType,
    workspaceId,
    sourceType: 'route-test',
    sourceId: 'wm-route-test',
    textSnippet: `Route test item ${Date.now()}`
  };
  const res = await fetch(`${baseUrl}/api/working-memory`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  assert.strictEqual(res.status, 201, `Create failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const deleteItem = async (id) => {
  const res = await fetch(`${baseUrl}/api/working-memory/${id}`, {
    method: 'DELETE',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `Delete failed status=${res.status} body=${text}`);
};

const run = async () => {
  const before = await listItems();
  assert.ok(Array.isArray(before), 'List response must be an array');

  const created = await createItem();
  assert.ok(created._id, 'Created item must include _id');
  assert.strictEqual(created.sourceType, 'route-test');

  const afterCreate = await listItems();
  assert.ok(afterCreate.some(item => String(item._id) === String(created._id)), 'Created item missing from list');

  await deleteItem(created._id);
  const afterDelete = await listItems();
  assert.ok(!afterDelete.some(item => String(item._id) === String(created._id)), 'Deleted item still present in list');

  console.log('working memory route tests passed');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
