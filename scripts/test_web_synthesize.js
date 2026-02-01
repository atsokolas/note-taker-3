#!/usr/bin/env node
const assert = require('assert');

const baseUrl = (process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const token = process.env.AUTH_TOKEN || '';

if (!token) {
  console.error('AUTH_TOKEN is required');
  process.exit(1);
}

const payload = {
  scopeType: 'custom',
  scopeId: '',
  itemIds: []
};

const run = async () => {
  const res = await fetch(`${baseUrl}/api/ai/synthesize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const bodyText = await res.text();
  assert.strictEqual(res.status, 200, `status=${res.status} body=${bodyText}`);

  const data = JSON.parse(bodyText);
  const expectedKeys = ['themes', 'connections', 'questions'];
  expectedKeys.forEach((key) => {
    assert.ok(Array.isArray(data[key]), `${key} must be an array`);
  });

  console.log('ok');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
