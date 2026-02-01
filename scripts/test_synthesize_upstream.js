#!/usr/bin/env node
const http = require('http');

const WEB_APP_URL = (process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const MOCK_AI_PORT = Number(process.env.MOCK_AI_PORT || 4567);
const AI_SHARED_SECRET = process.env.AI_SHARED_SECRET || '';
const HIGHLIGHT_ID = process.env.HIGHLIGHT_ID || '';
const SYNTH_PAYLOAD = process.env.SYNTH_PAYLOAD || '';

if (!AUTH_TOKEN) {
  console.error('AUTH_TOKEN is required');
  process.exit(1);
}

const buildPayload = () => {
  if (SYNTH_PAYLOAD) {
    try {
      return JSON.parse(SYNTH_PAYLOAD);
    } catch (err) {
      console.error('SYNTH_PAYLOAD must be valid JSON');
      process.exit(1);
    }
  }
  if (HIGHLIGHT_ID) {
    return {
      scopeType: 'custom',
      scopeId: '',
      itemIds: [{ objectType: 'highlight', objectId: HIGHLIGHT_ID }]
    };
  }
  return { scopeType: 'custom', scopeId: '', itemIds: [] };
};

const mockResponse = {
  themes: ['theme 1', 'theme 2', 'theme 3'],
  connections: ['connection 1', 'connection 2', 'connection 3'],
  questions: ['question 1', 'question 2', 'question 3']
};

const run = async () => {
  let received = null;
  const server = http.createServer((req, res) => {
    const { url, method, headers } = req;
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received = {
        url,
        method,
        headers,
        body
      };
      if (url !== '/synthesize' || method !== 'POST') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Not Found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockResponse));
    });
  });

  await new Promise((resolve) => server.listen(MOCK_AI_PORT, resolve));

  const payload = buildPayload();
  const res = await fetch(`${WEB_APP_URL}/api/ai/synthesize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await res.text();

  await new Promise((resolve) => setTimeout(resolve, 200));
  server.close();

  if (!received) {
    console.error('No request received by mock AI server.');
    console.error('Response:', res.status, responseText.slice(0, 200));
    process.exit(1);
  }

  const secretHeader = received.headers['x-ai-shared-secret'] || '';
  if (AI_SHARED_SECRET && secretHeader !== AI_SHARED_SECRET) {
    console.error('x-ai-shared-secret header mismatch.');
    console.error(`Expected: ${AI_SHARED_SECRET}`);
    console.error(`Received: ${secretHeader}`);
    process.exit(1);
  }

  if (received.url !== '/synthesize') {
    console.error(`Expected request path /synthesize, got ${received.url}`);
    process.exit(1);
  }

  if (res.status !== 200) {
    console.error(`Unexpected status ${res.status}: ${responseText.slice(0, 200)}`);
    process.exit(1);
  }

  console.log('ok');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
