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

const allowedBands = new Set(['High', 'Medium', 'Low']);

const requestJson = async (url, options = {}) => {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }
  return { status: res.status, data, text };
};

const upsertConcept = async (name) => {
  const res = await requestJson(`${baseUrl}/api/concepts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ description: `semantic test ${name}` })
  });
  assert.strictEqual(res.status, 200, `upsert concept failed status=${res.status} body=${res.text}`);
  return res.data;
};

const getHighlightSeed = async () => {
  const highlightsRes = await requestJson(`${baseUrl}/api/highlights/all`, {
    method: 'GET',
    headers
  });
  assert.strictEqual(highlightsRes.status, 200, `list highlights failed status=${highlightsRes.status} body=${highlightsRes.text}`);
  const highlights = Array.isArray(highlightsRes.data) ? highlightsRes.data : [];
  if (highlights.length > 0) return highlights[0];

  const articleRes = await requestJson(`${baseUrl}/save-article`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `Semantic route seed article ${Date.now()}`,
      url: `https://example.com/semantic-seed-${Date.now()}`,
      content: 'Semantic seed content to test related route.'
    })
  });
  assert.strictEqual(articleRes.status, 200, `save article failed status=${articleRes.status} body=${articleRes.text}`);
  const articleId = articleRes.data?._id;
  assert.ok(articleId, 'expected article id from save-article');

  const highlightRes = await requestJson(`${baseUrl}/articles/${articleId}/highlights`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'Semantic seed highlight text for route tests.' })
  });
  assert.strictEqual(highlightRes.status, 201, `create highlight failed status=${highlightRes.status} body=${highlightRes.text}`);
  return highlightRes.data?.highlight || highlightRes.data?.createdHighlight;
};

const assertSemanticResponseShape = (payload, { sourceType }) => {
  assert.ok(payload && typeof payload === 'object', 'expected object payload');
  assert.ok(Array.isArray(payload.results), 'expected results array');
  assert.ok(payload.meta && typeof payload.meta === 'object', 'expected meta object');
  assert.strictEqual(payload.meta.sourceType, sourceType, `expected meta.sourceType=${sourceType}`);
  assert.ok(typeof payload.meta.sourceId === 'string', 'expected meta.sourceId string');
  assert.ok(typeof payload.meta.modelAvailable === 'boolean', 'expected meta.modelAvailable boolean');
  assert.strictEqual(payload.meta.explanationVersion, 'v1', 'expected explanation version v1');

  payload.results.forEach((item) => {
    assert.ok(typeof item.objectType === 'string' && item.objectType.length > 0, 'expected result.objectType');
    assert.ok(typeof item.objectId === 'string' && item.objectId.length > 0, 'expected result.objectId');
    assert.ok(typeof item.title === 'string', 'expected result.title string');
    assert.ok(allowedBands.has(item.similarityBand), `unexpected similarityBand=${item.similarityBand}`);
  });
};

const run = async () => {
  const conceptName = `Semantic Related Route ${Date.now()}`;
  const concept = await upsertConcept(conceptName);
  const conceptId = String(concept?._id || '');
  assert.ok(conceptId, 'expected concept id');

  const conceptByName = await requestJson(
    `${baseUrl}/api/semantic/related?sourceType=concept&sourceId=${encodeURIComponent(conceptName)}&resultTypes=concept&limit=4`,
    { method: 'GET', headers }
  );
  assert.strictEqual(conceptByName.status, 200, `concept related by name failed status=${conceptByName.status} body=${conceptByName.text}`);
  assertSemanticResponseShape(conceptByName.data, { sourceType: 'concept' });
  assert.ok(conceptByName.data.results.length <= 4, 'concept related by name limit not enforced');

  const conceptById = await requestJson(
    `${baseUrl}/api/semantic/related?sourceType=concept&sourceId=${encodeURIComponent(conceptId)}&resultTypes=concept&limit=2`,
    { method: 'GET', headers }
  );
  assert.strictEqual(conceptById.status, 200, `concept related by id failed status=${conceptById.status} body=${conceptById.text}`);
  assertSemanticResponseShape(conceptById.data, { sourceType: 'concept' });
  assert.ok(conceptById.data.results.length <= 2, 'concept related by id limit not enforced');

  const highlight = await getHighlightSeed();
  const highlightId = String(highlight?._id || '');
  assert.ok(highlightId, 'expected highlight id');

  const highlightRelated = await requestJson(
    `${baseUrl}/api/semantic/related?sourceType=highlight&sourceId=${encodeURIComponent(highlightId)}&limit=3`,
    { method: 'GET', headers }
  );
  assert.strictEqual(highlightRelated.status, 200, `highlight related failed status=${highlightRelated.status} body=${highlightRelated.text}`);
  assertSemanticResponseShape(highlightRelated.data, { sourceType: 'highlight' });
  assert.ok(highlightRelated.data.results.length <= 3, 'highlight related limit not enforced');
  assert.ok(
    !highlightRelated.data.results.some(item => item.objectType === 'highlight' && String(item.objectId) === highlightId),
    'highlight source should be excluded from results'
  );

  console.log('semantic related route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
