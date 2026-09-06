import assert from 'assert';

import { NoeisClient } from '../src/client.js';

const clientWith = (responses) => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    const next = responses.shift();
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => next,
      text: async () => JSON.stringify(next)
    };
  };
  return { client: new NoeisClient({ token: 't', env: {}, fetchImpl }), calls };
};

const run = async () => {
  // A URL nothing matches. The receipt says "pending"; the verdict says the
  // source is unclaimed and names the page that would hold it.
  {
    const { client, calls } = clientWith([
      { runId: 'r1', status: 'pending', suggestedCreatePage: null },
      { runId: 'r1', status: 'processing' },
      { runId: 'r1', status: 'ignored', affectedPageIds: [], suggestedCreatePage: { title: 'A source', source: { type: 'external' } } }
    ]);
    const result = await client.ingestSource({ source: { type: 'url', url: 'https://example.com' }, waitMs: 5000 });
    assert.strictEqual(result.status, 'ignored');
    assert(result.suggestedCreatePage, 'the door out of ignored must survive the wait');
    assert.match(result.nextStep, /create_page/);
    assert.strictEqual(calls.length, 3);
    assert.strictEqual(calls[0].method, 'POST');
    assert.match(calls[2].url, /\/api\/wiki\/ingest\/r1$/);
  }

  // Matched an existing page: nothing is owed.
  {
    const { client } = clientWith([{ runId: 'r2', status: 'processed', affectedPageIds: ['p1', 'p2'] }]);
    const result = await client.ingestSource({ source: { type: 'url', url: 'https://example.com' } });
    assert.match(result.nextStep, /Folded into 2 existing pages/);
  }

  // Ignored with no suggestion is the proposal path, and says so.
  {
    const { client } = clientWith([{ runId: 'r3', status: 'ignored', affectedPageIds: [], suggestedCreatePage: null }]);
    const result = await client.ingestSource({ source: { type: 'text', text: 'x' } });
    assert.match(result.nextStep, /list_proposals/);
  }

  // Slow runs hand back the runId rather than hanging or lying about the outcome.
  {
    const { client, calls } = clientWith([
      { runId: 'r4', status: 'pending' },
      { runId: 'r4', status: 'pending' },
      { runId: 'r4', status: 'pending' }
    ]);
    const result = await client.ingestSource({ source: { type: 'url', url: 'https://example.com' }, waitMs: 0 });
    assert.strictEqual(result.status, 'pending');
    assert.match(result.nextStep, /get_ingest_run with runId r4/);
    assert.strictEqual(calls.length, 1, 'a zero wait must not poll');
  }

  // Prose reaches the API as prose. Flattening it here threw away the
  // paragraph breaks the server now knows how to keep.
  {
    const { client, calls } = clientWith([{ _id: 'p1', title: 'T' }]);
    await client.createPage({ title: 'T', body: 'First.\n\nSecond.', initialSourceRefs: [{ type: 'external', url: 'https://example.com' }] });
    assert.strictEqual(calls[0].body.body, 'First.\n\nSecond.');
    assert.strictEqual(calls[0].body.initialSourceRefs.length, 1);
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
