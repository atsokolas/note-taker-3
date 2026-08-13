const assert = require('assert');

// A provider rejecting an optional tuning hint used to fail the whole
// generation. For an ordinary Wiki build that failure is invisible: the page
// falls back to deterministic prose and still looks finished. These tests pin
// the recovery so the regression cannot return silently.

const loadClient = () => {
  const clientPath = require.resolve('./hfTextClient');
  delete require.cache[clientPath];
  return require('./hfTextClient');
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body)
});

const completion = (text = 'ok') => ({
  choices: [{ message: { content: text } }]
});

const withStubbedFetch = async (handler, run) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push(payload);
    return handler(payload, calls.length);
  };
  try {
    return await run(calls);
  } finally {
    global.fetch = originalFetch;
  }
};

const withEnv = async (overrides, run) => {
  const original = {};
  Object.entries(overrides).forEach(([key, value]) => {
    original[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try {
    return await run();
  } finally {
    Object.entries(original).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
};

const baseEnv = {
  HF_TOKEN: 'test-token',
  HF_TEXT_MODEL: 'openai/gpt-oss-120b',
  HF_TEXT_MODEL_FALLBACKS: '',
  HF_PROVIDER: 'groq',
  OPENROUTER_API_KEY: undefined,
  HF_AGENT_MODEL_ROUTES_JSON: undefined,
  HF_AGENT_CHAT_ROUTES: undefined
};

const run = async () => {
  await withEnv(baseEnv, async () => {
    const { chatComplete } = loadClient();

    // 1. The exact upstream rejection observed on the ordinary Wiki draft path.
    await withStubbedFetch(
      (payload) => (
        Object.prototype.hasOwnProperty.call(payload, 'reasoning')
          ? jsonResponse(400, {
              error: "reasoning: property 'reasoning' is unsupported",
              type: 'invalid_request_error',
              code: 'wrong_api_format'
            })
          : jsonResponse(200, completion('drafted'))
      ),
      async (calls) => {
        const result = await chatComplete({
          messages: [{ role: 'user', content: 'draft' }],
          reasoning: { effort: 'none' }
        });
        assert.equal(result.text, 'drafted');
        assert.ok(calls.length >= 2, 'expected a retry after the rejection');
        assert.ok(
          Object.prototype.hasOwnProperty.call(calls[0], 'reasoning'),
          'first attempt should still send the hint'
        );
        const succeeded = calls[calls.length - 1];
        assert.ok(
          !Object.prototype.hasOwnProperty.call(succeeded, 'reasoning'),
          'retry must drop the rejected field'
        );
        // Dropping the hint must not drop the work.
        assert.deepEqual(succeeded.messages, [{ role: 'user', content: 'draft' }]);
      }
    );

    // 2. A rejection naming a different field is a real error, not a hint we
    //    may quietly discard.
    await withStubbedFetch(
      () => jsonResponse(400, { error: 'messages: property is malformed' }),
      async () => {
        await assert.rejects(
          () => chatComplete({
            messages: [{ role: 'user', content: 'draft' }],
            reasoning: { effort: 'none' }
          }),
          error => error.status === 400
        );
      }
    );

    // 3. A request that never sent the hint gains no extra attempts.
    await withStubbedFetch(
      () => jsonResponse(200, completion('plain')),
      async (calls) => {
        const result = await chatComplete({ messages: [{ role: 'user', content: 'draft' }] });
        assert.equal(result.text, 'plain');
        assert.equal(calls.length, 1);
      }
    );

    // 4. Server errors keep failing. Retrying a 500 by stripping a field would
    //    hide a genuine outage behind a slightly different request.
    await withStubbedFetch(
      () => jsonResponse(500, { error: 'reasoning: unsupported' }),
      async () => {
        await assert.rejects(
          () => chatComplete({
            messages: [{ role: 'user', content: 'draft' }],
            reasoning: { effort: 'none' }
          }),
          error => error.status === 500
        );
      }
    );

    // 5. Both hints rejected in turn still yields a usable generation.
    await withStubbedFetch(
      (payload) => {
        if (Object.prototype.hasOwnProperty.call(payload, 'provider')) {
          return jsonResponse(400, { error: 'provider: unknown field' });
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'reasoning')) {
          return jsonResponse(400, { error: "reasoning: property 'reasoning' is unsupported" });
        }
        return jsonResponse(200, completion('recovered'));
      },
      async (calls) => {
        const result = await chatComplete({
          messages: [{ role: 'user', content: 'draft' }],
          reasoning: { effort: 'none' }
        });
        assert.equal(result.text, 'recovered');
        const succeeded = calls[calls.length - 1];
        assert.ok(!Object.prototype.hasOwnProperty.call(succeeded, 'provider'));
        assert.ok(!Object.prototype.hasOwnProperty.call(succeeded, 'reasoning'));
      }
    );
  });
};

if (require.main === module) {
  run()
    .then(() => console.log('hfTextClient optional field fallback tests passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
