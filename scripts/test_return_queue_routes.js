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

const createNotebookEntry = async () => {
  const payload = {
    title: `Return queue route test ${Date.now()}`,
    content: 'Temporary note for return queue route test.',
    blocks: []
  };
  const res = await fetch(`${baseUrl}/api/notebook`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  assert.strictEqual(res.status, 201, `Failed to create notebook entry status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const addReturnQueueEntry = async (itemId) => {
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const payload = {
    itemType: 'notebook',
    itemId,
    reason: 'route test',
    dueAt
  };
  const res = await fetch(`${baseUrl}/api/return-queue`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  assert.strictEqual(res.status, 201, `Failed to add return queue entry status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const listEntries = async (filter = 'all') => {
  const res = await fetch(`${baseUrl}/api/return-queue?filter=${encodeURIComponent(filter)}`, {
    method: 'GET',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `Failed to list return queue entries status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const patchEntry = async (id, payload) => {
  const res = await fetch(`${baseUrl}/api/return-queue/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `Failed to patch return queue entry status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const run = async () => {
  const notebook = await createNotebookEntry();
  assert.ok(notebook._id, 'Notebook entry should include _id');

  const created = await addReturnQueueEntry(notebook._id);
  assert.ok(created._id, 'Return queue entry should include _id');
  assert.strictEqual(created.itemType, 'notebook');

  const allItems = await listEntries('all');
  assert.ok(allItems.some(item => String(item._id) === String(created._id)), 'Created entry missing from all filter');

  const done = await patchEntry(created._id, { action: 'done' });
  assert.strictEqual(done.status, 'completed', 'Entry should be completed after done action');

  const snoozed = await patchEntry(created._id, { action: 'snooze', snoozeDays: 3 });
  assert.strictEqual(snoozed.status, 'pending', 'Entry should return to pending after snooze');
  assert.ok(snoozed.dueAt, 'Snoozed entry should have dueAt');

  const upcomingItems = await listEntries('upcoming');
  assert.ok(upcomingItems.some(item => String(item._id) === String(created._id)), 'Snoozed entry missing from upcoming filter');

  console.log('return queue route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
