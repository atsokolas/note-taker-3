const assert = require('node:assert');

/* Embeddings come from OpenRouter. These pin the request the provider sees,
   that an answer is returned in input order, and that "not now" (a rate limit
   or an empty balance) is refused at once and cooled down rather than waited
   out on every search. */

const load = (fetchImpl, env = { OPENROUTER_API_KEY: 'test-key' }) => {
  global.fetch = fetchImpl;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_EMBEDDING_MODEL;
  Object.assign(process.env, env);
  delete require.cache[require.resolve('./embed')];
  return require('./embed');
};

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, statusText: 'x', json: async () => body });

(async () => {
  const originalFetch = global.fetch;
  try {
    // The stored vectors' model, asked for by name, with results in input order.
    {
      let request = null;
      const { embedTexts, embedText } = load(async (url, init) => {
        request = { url, init, body: JSON.parse(init.body) };
        return reply(200, { data: [{ index: 1, embedding: [0.3, 0.4] }, { index: 0, embedding: [0.1, 0.2] }] });
      });
      const vectors = await embedTexts(['first', 'second']);
      assert.deepStrictEqual(vectors, [[0.1, 0.2], [0.3, 0.4]], 'rows are returned in input order');
      assert.strictEqual(request.url, 'https://openrouter.ai/api/v1/embeddings');
      assert.strictEqual(request.init.headers.Authorization, 'Bearer test-key');
      assert.deepStrictEqual(request.body, { model: 'sentence-transformers/all-minilm-l6-v2', input: ['first', 'second'] });
      global.fetch = async () => reply(200, { data: [{ index: 0, embedding: [0.5] }] });
      assert.deepStrictEqual(await embedText('one'), [0.5]);
    }

    // No key: refused plainly, nothing sent.
    {
      let calls = 0;
      const { embedText } = load(async () => { calls += 1; return reply(200, {}); }, {});
      await assert.rejects(() => embedText('some text'), error => error.status === 503);
      assert.strictEqual(calls, 0);
    }

    // 429, 529 (overloaded) and 402 (empty balance): one attempt, then a cooldown that skips the provider.
    for (const status of [429, 529, 402]) {
      let calls = 0;
      const { embedText } = load(async () => { calls += 1; return reply(status, { error: { message: 'not now' } }); });
      const started = Date.now();
      await assert.rejects(() => embedText('some text'), error => error.status === 429);
      assert.ok(Date.now() - started < 1000, 'refused promptly');
      await assert.rejects(
        () => embedText('another text'),
        error => error.status === 429 && Number(error?.payload?.retryAfterMs) > 0
      );
      assert.strictEqual(calls, 1, `a ${status} is asked once, then cooled down`);
    }

    // A bad request keeps its status and is not retried.
    {
      let calls = 0;
      const { embedText } = load(async () => { calls += 1; return reply(400, { error: { message: 'bad' } }); });
      await assert.rejects(
        () => embedText('some text'),
        error => error.status === 400 && /bad/.test(error.payload.error)
      );
      assert.strictEqual(calls, 1);
    }

    // Empty text never reaches the provider.
    {
      let calls = 0;
      const { embedText } = load(async () => { calls += 1; return reply(200, {}); });
      await assert.rejects(() => embedText('   '), error => error.status === 400);
      assert.strictEqual(calls, 0);
    }

    console.log('embed tests passed');
  } finally {
    global.fetch = originalFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
