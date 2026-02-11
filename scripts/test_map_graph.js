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

const run = async () => {
  const res = await fetch(`${baseUrl}/api/map/graph?limit=50&offset=0`, {
    method: 'GET',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `map graph failed status=${res.status} body=${text}`);
  const data = JSON.parse(text);
  assert.ok(Array.isArray(data.nodes), 'nodes should be array');
  assert.ok(Array.isArray(data.edges), 'edges should be array');
  assert.ok(data.page && typeof data.page === 'object', 'page missing');
  console.log(`map graph test passed (${data.nodes.length} nodes, ${data.edges.length} edges)`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
