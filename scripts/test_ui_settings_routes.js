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

const getSettings = async (scope = {}) => {
  const params = new URLSearchParams({
    workspaceType: scope.workspaceType || 'global',
    workspaceId: scope.workspaceId || ''
  });
  const res = await fetch(`${baseUrl}/api/ui-settings?${params.toString()}`, {
    method: 'GET',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `GET /api/ui-settings failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const putSettings = async (payload) => {
  const res = await fetch(`${baseUrl}/api/ui-settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `PUT /api/ui-settings failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const run = async () => {
  const scope = {
    workspaceType: 'workspace',
    workspaceId: `ui-settings-test-${Date.now()}`
  };

  const defaults = await getSettings(scope);
  assert.strictEqual(defaults.workspaceType, scope.workspaceType);
  assert.strictEqual(defaults.workspaceId, scope.workspaceId);
  assert.strictEqual(defaults.typographyScale, 'default');
  assert.strictEqual(defaults.density, 'comfortable');
  assert.strictEqual(defaults.theme, 'light');
  assert.strictEqual(defaults.accent, 'blue');

  const next = {
    ...scope,
    typographyScale: 'large',
    density: 'compact',
    theme: 'dark',
    accent: 'rose'
  };

  const updated = await putSettings(next);
  assert.strictEqual(updated.workspaceType, scope.workspaceType);
  assert.strictEqual(updated.workspaceId, scope.workspaceId);
  assert.strictEqual(updated.typographyScale, next.typographyScale);
  assert.strictEqual(updated.density, next.density);
  assert.strictEqual(updated.theme, next.theme);
  assert.strictEqual(updated.accent, next.accent);

  const persisted = await getSettings(scope);
  assert.strictEqual(persisted.typographyScale, next.typographyScale);
  assert.strictEqual(persisted.density, next.density);
  assert.strictEqual(persisted.theme, next.theme);
  assert.strictEqual(persisted.accent, next.accent);

  console.log('ui settings route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
