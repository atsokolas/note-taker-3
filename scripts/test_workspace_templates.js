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

const REQUIRED_TEMPLATE_IDS = [
  'research-paper-analysis',
  'book-notes',
  'project-planning',
  'meeting-notes',
  'learning-path',
  'decision-log',
  'writing-sprint'
];

const requestJson = async (url, options = {}) => {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = null;
  }
  return { res, text, data };
};

const run = async () => {
  const list = await requestJson(`${baseUrl}/api/templates`, {
    method: 'GET',
    headers
  });
  assert.strictEqual(list.res.status, 200, `GET /api/templates failed status=${list.res.status} body=${list.text}`);

  const templates = Array.isArray(list.data) ? list.data : [];
  assert.ok(templates.length >= 7, `expected at least 7 templates, got ${templates.length}`);
  const idSet = new Set(templates.map(template => template.id));
  REQUIRED_TEMPLATE_IDS.forEach((id) => {
    assert.ok(idSet.has(id), `missing required template id: ${id}`);
  });

  const templateId = 'research-paper-analysis';
  const preview = await requestJson(`${baseUrl}/api/templates/${encodeURIComponent(templateId)}/create`, {
    method: 'GET',
    headers
  });
  assert.strictEqual(
    preview.res.status,
    200,
    `GET /api/templates/:id/create failed status=${preview.res.status} body=${preview.text}`
  );

  const template = preview.data?.template;
  assert.ok(template, 'template preview missing template object');
  assert.ok(Array.isArray(template.groups) && template.groups.length === 4, 'template groups must have 4 entries');
  assert.ok(Array.isArray(template.sampleEntries) && template.sampleEntries.length >= 2, 'template sampleEntries missing');
  assert.ok(Array.isArray(template.workflowTips) && template.workflowTips.length >= 3, 'template workflowTips missing');

  const conceptName = `Template Test ${Date.now()}`;
  const created = await requestJson(`${baseUrl}/api/templates/${encodeURIComponent(templateId)}/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ conceptName })
  });

  assert.strictEqual(
    created.res.status,
    201,
    `POST /api/templates/:id/create failed status=${created.res.status} body=${created.text}`
  );

  assert.ok(created.data?.conceptId, 'created conceptId missing');
  assert.strictEqual(created.data?.conceptName, conceptName, 'created concept name mismatch');
  assert.ok(Array.isArray(created.data?.createdSampleEntryIds), 'createdSampleEntryIds missing');
  assert.ok(created.data.createdSampleEntryIds.length >= 2, 'expected at least 2 sample entries');

  const workspace = created.data?.workspace;
  assert.ok(workspace && typeof workspace === 'object', 'workspace missing');
  assert.strictEqual(workspace.version, 1, 'workspace version should be 1');

  const sections = Array.isArray(workspace.outlineSections)
    ? workspace.outlineSections
    : (Array.isArray(workspace.groups) ? workspace.groups : []);
  const items = Array.isArray(workspace.attachedItems)
    ? workspace.attachedItems
    : (Array.isArray(workspace.items) ? workspace.items : []);

  assert.ok(sections.length >= 4, `expected >=4 sections, got ${sections.length}`);
  assert.ok(items.length >= 2, `expected >=2 attached items, got ${items.length}`);

  const notebook = await requestJson(`${baseUrl}/api/notebook`, {
    method: 'GET',
    headers
  });
  assert.strictEqual(notebook.res.status, 200, `GET /api/notebook failed status=${notebook.res.status} body=${notebook.text}`);
  const notebookEntries = Array.isArray(notebook.data) ? notebook.data : [];
  const notebookIds = new Set(notebookEntries.map(entry => String(entry._id)));

  created.data.createdSampleEntryIds.forEach((entryId) => {
    assert.ok(notebookIds.has(String(entryId)), `sample notebook entry missing: ${entryId}`);
  });

  console.log('workspace template route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
