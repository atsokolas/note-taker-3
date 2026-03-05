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

const getState = async () => {
  const res = await fetch(`${baseUrl}/api/tour/state`, {
    method: 'GET',
    headers
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `GET /api/tour/state failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const putState = async (payload) => {
  const res = await fetch(`${baseUrl}/api/tour/state`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload || {})
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `PUT /api/tour/state failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const postEvent = async (eventType, metadata = {}) => {
  const res = await fetch(`${baseUrl}/api/tour/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ eventType, metadata })
  });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `POST /api/tour/events failed status=${res.status} body=${text}`);
  return JSON.parse(text);
};

const run = async () => {
  const reset = await putState({ reset: true });
  assert.strictEqual(reset.status, 'not_started');
  assert.deepStrictEqual(reset.completedStepIds, []);

  const started = await putState({ status: 'in_progress' });
  assert.strictEqual(started.status, 'in_progress');
  assert.ok(typeof started.currentStepId === 'string' || started.currentStepId === null);

  const event1 = await postEvent('extension_connected', { source: 'script-test' });
  assert.strictEqual(event1.accepted, true);
  assert.strictEqual(event1.signalKey, 'extensionConnected');
  assert.strictEqual(event1.state.signals.extensionConnected, true);
  assert.ok(event1.state.completedStepIds.includes('install_extension'));

  const timestamp1 = event1.state.eventTimestamps.extension_connected;
  assert.ok(timestamp1, 'expected extension_connected timestamp');

  const event2 = await postEvent('extension_connected', { source: 'script-test-repeat' });
  const timestamp2 = event2.state.eventTimestamps.extension_connected;
  assert.strictEqual(timestamp2, timestamp1, 'event timestamp should remain stable for duplicate events');

  const event3 = await postEvent('highlight_captured', { source: 'script-test' });
  assert.strictEqual(event3.state.signals.firstHighlightCaptured, true);
  assert.ok(event3.state.completedStepIds.includes('capture_first_highlight'));

  const finalState = await getState();
  assert.strictEqual(finalState.signals.extensionConnected, true);
  assert.strictEqual(finalState.signals.firstHighlightCaptured, true);
  assert.ok(Array.isArray(finalState.completedStepIds));

  const resetAgain = await putState({ reset: true });
  assert.strictEqual(resetAgain.status, 'not_started');
  assert.deepStrictEqual(resetAgain.completedStepIds, []);
  assert.strictEqual(resetAgain.signals.extensionConnected, false);
  assert.strictEqual(resetAgain.signals.firstHighlightCaptured, false);

  console.log('tour route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

