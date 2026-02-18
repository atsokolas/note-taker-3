#!/usr/bin/env node
const assert = require('assert');

const baseUrl = (process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const token = process.env.AUTH_TOKEN || '';
const workspaceType = process.env.WM_WORKSPACE_TYPE || 'think';
const workspaceId = process.env.WM_WORKSPACE_ID || `wm-extract-${Date.now()}`;

if (!token) {
  console.error('AUTH_TOKEN is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};

const listActive = async () => {
  const params = new URLSearchParams({
    workspaceType,
    workspaceId,
    status: 'active'
  });
  const res = await fetch(`${baseUrl}/api/working-memory?${params.toString()}`, { headers });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `List failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const createItem = async (textSnippet) => {
  const payload = {
    workspaceType,
    workspaceId,
    sourceType: 'wm-route-test',
    sourceId: 'wm-route-test',
    textSnippet
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

const promoteToNotebook = async (ids) => {
  const res = await fetch(`${baseUrl}/api/working-memory/promote/notebook`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ids,
      title: 'WM Promotion Smoke',
      tags: ['smoke', 'wm']
    })
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `Promote notebook failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const archiveItems = async (ids) => {
  const res = await fetch(`${baseUrl}/api/working-memory/archive`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids })
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `Archive failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const splitItem = async (id, mode = 'newline') => {
  const res = await fetch(`${baseUrl}/api/working-memory/${id}/split`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode })
  });
  const text = await res.text();
  assert.strictEqual(res.status, 201, `Split failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const run = async () => {
  const itemA = await createItem('Promote me to notebook.');
  const itemB = await createItem('Archive me.');
  const itemC = await createItem('Line one\nLine two\nLine three');

  const promoteResult = await promoteToNotebook([itemA._id]);
  assert.ok(promoteResult.notebookEntry?._id, 'Promotion should return notebookEntry');
  assert.ok((promoteResult.archivedCount || 0) >= 1, 'Promotion should archive promoted block');

  const splitResult = await splitItem(itemC._id, 'newline');
  assert.ok(Array.isArray(splitResult.created), 'Split should return created array');
  assert.ok(splitResult.created.length >= 2, 'Split should create multiple blocks');

  const archiveResult = await archiveItems([itemB._id]);
  assert.ok((archiveResult.archivedCount || 0) >= 1, 'Archive should archive item');

  const remaining = await listActive();
  assert.ok(!remaining.some(item => String(item._id) === String(itemA._id)), 'Promoted item should not remain active');
  assert.ok(!remaining.some(item => String(item._id) === String(itemB._id)), 'Archived item should not remain active');
  assert.ok(!remaining.some(item => String(item._id) === String(itemC._id)), 'Split source item should not remain active');
  assert.ok(remaining.some(item => splitResult.created.some(created => String(created._id) === String(item._id))), 'Split blocks should be active');

  console.log('working memory extraction route smoke passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
