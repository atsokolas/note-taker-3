#!/usr/bin/env node
const assert = require('assert');
const { parseAiServiceUrl, joinUrl } = require('../server/utils/aiUpstream');

const run = () => {
  const withSlash = parseAiServiceUrl('https://ai-5q0l.onrender.com/');
  assert.strictEqual(withSlash.origin, 'https://ai-5q0l.onrender.com');
  assert.strictEqual(withSlash.hasPath, false);
  assert.strictEqual(joinUrl(withSlash.origin, '/synthesize'), 'https://ai-5q0l.onrender.com/synthesize');

  const withoutSlash = parseAiServiceUrl('https://ai-5q0l.onrender.com');
  assert.strictEqual(withoutSlash.origin, 'https://ai-5q0l.onrender.com');
  assert.strictEqual(withoutSlash.hasPath, false);
  assert.strictEqual(joinUrl(withoutSlash.origin, 'synthesize'), 'https://ai-5q0l.onrender.com/synthesize');

  const withPath = parseAiServiceUrl('https://ai-5q0l.onrender.com/api/ai');
  assert.strictEqual(withPath.origin, 'https://ai-5q0l.onrender.com');
  assert.strictEqual(withPath.hasPath, true);
  assert.strictEqual(joinUrl(withPath.origin, '/synthesize'), 'https://ai-5q0l.onrender.com/synthesize');

  console.log('ok');
};

run();
