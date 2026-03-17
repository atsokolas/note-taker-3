#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const baseUrl = String(process.env.API_BASE_URL || process.env.WEB_APP_URL || 'http://127.0.0.1:5500').replace(/\/+$/, '');
const authToken = String(process.env.AUTH_TOKEN || '').trim();

if (!authToken) {
  console.error('AUTH_TOKEN is required.');
  process.exit(1);
}

const scriptNames = [
  'test_claim_evidence_routes.js',
  'test_connection_routes.js',
  'test_concept_paths.js',
  'test_return_queue_routes.js',
  'test_ui_settings_routes.js',
  'test_working_memory_routes.js',
  'test_map_graph.js',
  'test_retrieval_search.js',
  'test_semantic_related_route.js',
  'test_working_memory_extraction_routes.js',
  'test_tour_routes.js',
  'test_workspace_templates.js'
];

for (const scriptName of scriptNames) {
  console.log(`RUN scripts/${scriptName}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      AUTH_TOKEN: authToken,
      API_BASE_URL: baseUrl,
      WEB_APP_URL: baseUrl
    }
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('server smoke suite passed');
