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

const createNotebookEntry = async (title) => {
  const created = await request('/api/notebook', {
    method: 'POST',
    body: JSON.stringify({
      title,
      content: `${title} is a repeated emerging wiki route-test signal.`,
      blocks: []
    })
  });
  assertStatus(created, 201, `create notebook ${title}`);
  assert.ok(created.body._id, 'notebook entry should include _id');
  return created.body;
};

const createSignalPair = async (label) => {
  await createNotebookEntry(label);
  await createNotebookEntry(label);
};

const findProposal = (proposals, label) => {
  const normalized = label.toLowerCase();
  return proposals.find(proposal => String(proposal.title || '').toLowerCase().includes(normalized));
};

const run = async () => {
  const stamp = Date.now();
  const watchLabel = `Smoke Watch ${stamp}`;
  const dismissLabel = `Smoke Dismiss ${stamp}`;
  const acceptLabel = `Smoke Accept ${stamp}`;
  const mergeLabel = `Smoke Merge ${stamp}`;

  await createSignalPair(watchLabel);
  await createSignalPair(dismissLabel);
  await createSignalPair(acceptLabel);
  await createSignalPair(mergeLabel);

  const listed = await request('/api/wiki/proposals');
  assertStatus(listed, 200, 'list wiki proposals');
  assert.ok(Array.isArray(listed.body.proposals), 'list response should include proposals array');
  assert.strictEqual(typeof listed.body.generated, 'boolean', 'list response should include generated boolean');

  const generated = await request('/api/wiki/proposals/generate-background', {
    method: 'POST',
    body: JSON.stringify({ force: true })
  });
  assertStatus(generated, 200, 'generate wiki proposals');
  assert.ok(Array.isArray(generated.body.proposals), 'generate response should include proposals array');

  const proposals = generated.body.proposals;
  const watchProposal = findProposal(proposals, watchLabel);
  const dismissProposal = findProposal(proposals, dismissLabel);
  const acceptProposal = findProposal(proposals, acceptLabel);
  const mergeProposal = findProposal(proposals, mergeLabel);
  assert.ok(watchProposal, `missing watch proposal for ${watchLabel}`);
  assert.ok(dismissProposal, `missing dismiss proposal for ${dismissLabel}`);
  assert.ok(acceptProposal, `missing accept proposal for ${acceptLabel}`);
  assert.ok(mergeProposal, `missing merge proposal for ${mergeLabel}`);

  const watched = await request(`/api/wiki/proposals/${watchProposal._id}/watch`, { method: 'POST' });
  assertStatus(watched, 200, 'watch wiki proposal');
  assert.strictEqual(watched.body.status, 'watched');

  const dismissed = await request(`/api/wiki/proposals/${dismissProposal._id}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'route smoke test' })
  });
  assertStatus(dismissed, 200, 'dismiss wiki proposal');
  assert.strictEqual(dismissed.body.status, 'dismissed');

  const accepted = await request(`/api/wiki/proposals/${acceptProposal._id}/accept`, { method: 'POST' });
  assertStatus(accepted, 201, 'accept wiki proposal');
  assert.strictEqual(accepted.body.proposal.status, 'accepted');
  assert.strictEqual(accepted.body.page.status, 'draft');
  assert.ok(accepted.body.page._id, 'accepted proposal should return created page');

  const mergeTarget = await request('/api/wiki/pages', {
    method: 'POST',
    body: JSON.stringify({ title: `Smoke Merge Target ${stamp}` })
  });
  assertStatus(mergeTarget, 201, 'create merge target page');

  const merged = await request(`/api/wiki/proposals/${mergeProposal._id}/merge`, {
    method: 'POST',
    body: JSON.stringify({ pageId: mergeTarget.body._id })
  });
  assertStatus(merged, 200, 'merge wiki proposal');
  assert.strictEqual(merged.body.status, 'merged');
  assert.strictEqual(String(merged.body.mergedIntoPageId), String(mergeTarget.body._id));

  console.log('wiki proposal route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
