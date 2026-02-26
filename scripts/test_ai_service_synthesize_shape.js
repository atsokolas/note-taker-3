#!/usr/bin/env node

const AI_SERVICE_URL = String(process.env.AI_SERVICE_URL || 'https://ai-5q0l.onrender.com').replace(/\/+$/, '');
const AI_SHARED_SECRET = String(process.env.AI_SHARED_SECRET || '').trim();

if (!AI_SHARED_SECRET) {
  console.error('AI_SHARED_SECRET is required');
  process.exit(1);
}

const payload = {
  items: [
    {
      type: 'note',
      id: 'smoke-1',
      text: 'Battery supply chains, pricing pressure, and local manufacturing scale.'
    }
  ],
  prompt: 'Return themes, connections, and questions.'
};

const assertList = (body, key) => {
  const value = body[key];
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${key} must be an array of exactly 3 strings`);
  }
  if (!value.every(item => typeof item === 'string')) {
    throw new Error(`${key} must contain only strings`);
  }
};

const run = async () => {
  const res = await fetch(`${AI_SERVICE_URL}/synthesize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-shared-secret': AI_SHARED_SECRET
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (_err) {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }

  const keys = Object.keys(body).sort();
  const expected = ['connections', 'questions', 'themes'];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected keys: ${keys.join(', ')}`);
  }

  assertList(body, 'themes');
  assertList(body, 'connections');
  assertList(body, 'questions');
  console.log('ok');
};

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
