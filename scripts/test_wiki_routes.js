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

const request = async (path, options = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_error) {
    body = { raw: text };
  }
  return { res, body, text };
};

const assertStatus = (response, status, label) => {
  assert.strictEqual(
    response.res.status,
    status,
    `${label} failed status=${response.res.status} body=${response.text}`
  );
};

const run = async () => {
  const createdPayload = {
    title: `Wiki Route Test ${Date.now()}`,
    createdFrom: {
      type: 'idea',
      text: 'A route test can become a wiki page.',
      label: 'Route test idea'
    }
  };

  const created = await request('/api/wiki/pages', {
    method: 'POST',
    body: JSON.stringify(createdPayload)
  });
  assertStatus(created, 201, 'create wiki page');
  assert.strictEqual(created.body.status, 'draft');
  assert.strictEqual(created.body.visibility, 'private');
  assert.strictEqual(created.body.sourceScope, 'entire_library');
  assert.ok(created.body._id, 'created page should include _id');

  const patched = await request(`/api/wiki/pages/${created.body._id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'Updated Wiki Route Test',
      pageType: 'project',
      status: 'published',
      visibility: 'shared',
      sourceScope: 'selected_sources',
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated body text.' }] }]
      }
    })
  });
  assertStatus(patched, 200, 'patch wiki page');
  assert.strictEqual(patched.body.title, 'Updated Wiki Route Test');
  assert.strictEqual(patched.body.pageType, 'project');
  assert.strictEqual(patched.body.status, 'published');
  assert.strictEqual(patched.body.visibility, 'shared');
  assert.strictEqual(patched.body.sourceScope, 'selected_sources');
  assert.ok(patched.body.plainText.includes('Updated body text'));

  const invalidEnum = await request(`/api/wiki/pages/${created.body._id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'not-a-status' })
  });
  assertStatus(invalidEnum, 400, 'invalid enum patch');

  const drafted = await request(`/api/wiki/pages/${created.body._id}/ai/draft`, { method: 'POST' });
  assertStatus(drafted, 200, 'draft wiki page');
  assert.strictEqual(drafted.body.aiState.draftStatus, 'ready');
  assert.strictEqual(drafted.body.aiState.model, 'local-stub');
  assert.strictEqual(drafted.body.aiState.sourceScopeAtDraft, 'selected_sources');
  assert.ok(drafted.body.aiState.lastDraftedAt, 'draft should include lastDraftedAt');

  const listed = await request('/api/wiki/pages');
  assertStatus(listed, 200, 'list wiki pages');
  assert.ok(Array.isArray(listed.body), 'list response should be an array');
  assert.ok(listed.body.some(page => String(page._id) === String(created.body._id)), 'created page should be listed');

  const sourceAdded = await request(`/api/wiki/pages/${created.body._id}/sources`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'external',
      title: 'Route test source',
      snippet: 'Source content used by the route test.',
      url: 'https://example.com/wiki-route-test'
    })
  });
  assertStatus(sourceAdded, 201, 'add wiki source');
  assert.strictEqual(sourceAdded.body.sourceRefs.length, 1);
  const sourceRefId = sourceAdded.body.sourceRefs[0]._id;
  assert.ok(sourceRefId, 'source should include _id');

  const invalidSource = await request(`/api/wiki/pages/${created.body._id}/sources`, {
    method: 'POST',
    body: JSON.stringify({ type: 'bad-source' })
  });
  assertStatus(invalidSource, 400, 'reject invalid wiki source');

  const sourceRemoved = await request(`/api/wiki/pages/${created.body._id}/sources/${sourceRefId}`, {
    method: 'DELETE'
  });
  assertStatus(sourceRemoved, 200, 'remove wiki source');
  assert.strictEqual(sourceRemoved.body.sourceRefs.length, 0);

  const archived = await request(`/api/wiki/pages/${created.body._id}`, { method: 'DELETE' });
  assertStatus(archived, 200, 'archive wiki page');
  assert.strictEqual(archived.body.status, 'archived');

  console.log('wiki route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
