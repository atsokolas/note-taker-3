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

const createNotebookEntry = async (title, content, tags = [], type = 'note') => {
  const res = await fetch(`${baseUrl}/api/notebook`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, content, tags, type, blocks: [] })
  });
  const text = await res.text();
  assert.strictEqual(res.status, 201, `Failed to create notebook entry status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const createConnection = async (fromId, toId) => {
  const res = await fetch(`${baseUrl}/api/connections`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fromType: 'notebook',
      fromId,
      toType: 'notebook',
      toId,
      relationType: 'related'
    })
  });
  const text = await res.text();
  assert.ok([201, 409].includes(res.status), `Failed to create connection status=${res.status} body=${text}`);
};

const recordView = async (itemType, itemId, previousItemType = '', previousItemId = '') => {
  const res = await fetch(`${baseUrl}/api/retrieval/view`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ itemType, itemId, previousItemType, previousItemId })
  });
  const text = await res.text();
  assert.strictEqual(res.status, 201, `Failed to record view status=${res.status} body=${text}`);
};

const fetchRelated = async (itemType, itemId) => {
  const params = new URLSearchParams({ itemType, itemId, limit: '8' });
  const res = await fetch(`${baseUrl}/api/retrieval/related?${params.toString()}`, {
    method: 'GET',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `Failed to fetch related status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const runSearch = async (query) => {
  const params = new URLSearchParams({
    q: query,
    scope: 'notebook',
    tags: 'retrieval-test',
    type: 'note,claim'
  });
  const res = await fetch(`${baseUrl}/api/search?${params.toString()}`, {
    method: 'GET',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `Failed to search status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const run = async () => {
  const seed = Date.now();
  const noteA = await createNotebookEntry(
    `Retrieval A ${seed}`,
    `alpha retrieval seed ${seed}`,
    ['retrieval-test', 'alpha'],
    'note'
  );
  const noteB = await createNotebookEntry(
    `Retrieval B ${seed}`,
    `alpha claim seed ${seed}`,
    ['retrieval-test', 'alpha'],
    'claim'
  );

  await createConnection(noteA._id, noteB._id);
  await recordView('notebook', noteB._id);
  await recordView('notebook', noteA._id, 'notebook', noteB._id);

  const related = await fetchRelated('notebook', noteA._id);
  assert.ok(Array.isArray(related.items), 'related.items should be an array');
  assert.ok(
    related.items.some(item => String(item.itemId) === String(noteB._id)),
    'Expected related suggestions to include connected/co-viewed note'
  );

  const search = await runSearch(String(seed));
  assert.ok(search.groups, 'Expected groups in search response');
  assert.ok(Array.isArray(search.groups.notes), 'Expected notes group');
  assert.ok(Array.isArray(search.groups.claims), 'Expected claims group');
  assert.ok(
    search.groups.notes.length > 0 || search.groups.claims.length > 0,
    'Expected grouped keyword search results for seeded notebook entries'
  );

  console.log('retrieval search tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
