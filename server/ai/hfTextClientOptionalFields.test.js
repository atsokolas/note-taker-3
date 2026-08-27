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

const streamingResponse = (text, status = 200) => {
  const encoder = new TextEncoder();
  const chunks = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
    'data: [DONE]\n\n'
  ].map(chunk => encoder.encode(chunk));
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        read: async () => index < chunks.length
          ? { done: false, value: chunks[index++] }
          : { done: true, value: undefined },
        cancel: async () => {}
      })
    },
    text: async () => ''
  };
};

const completion = (text = 'ok') => ({
  choices: [{ message: { content: text } }]
});

const withStubbedFetch = async (handler, run) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push(payload);
    return handler(payload, calls.length, url);
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

    // 6. Route contracts supply task-specific defaults when the caller does
    //    not override them.
    await withStubbedFetch(
      () => jsonResponse(200, completion('A grounded answer.')),
      async (calls) => {
        const result = await chatComplete({
          route: 'partner_chat',
          messages: [{ role: 'user', content: 'answer from my note' }]
        });
        assert.equal(result.route, 'partner_chat');
        assert.equal(result.outputContract, 'plain_text');
        assert.equal(calls[0].temperature, 0.25);
        assert.equal(calls[0].max_tokens, 360);
        assert.equal(calls[0].reasoning_effort, 'low');
      }
    );

    // 7. Invalid structured output fails over to the next provider route
    //    instead of leaking an unvalidated plan into the product.
    await withStubbedFetch(
      (payload) => payload.provider === 'groq'
        ? jsonResponse(200, completion('not structured'))
        : jsonResponse(200, completion('{"title":"Reviewable plan","operations":[]}')),
      async (calls) => {
        const result = await chatComplete({
          route: 'structure_planner',
          messages: [{ role: 'user', content: 'organize this workspace' }]
        });
        assert.equal(result.outputContract, 'json');
        assert.equal(result.provider, 'cerebras');
        assert.deepEqual(calls[0].response_format, { type: 'json_object' });
        assert.ok(calls.length >= 2, 'invalid JSON should advance to the next configured route');
      }
    );

    // 8. OpenRouter may be preferred without becoming a single point of failure.
    //    An incomplete schema-bound plan must fail closed there and retry on HF.
    await withEnv({
      ...baseEnv,
      OPENROUTER_API_KEY: 'test-openrouter-key',
      OPENROUTER_TEXT_MODEL: 'openai/gpt-4o-mini',
      OPENROUTER_TEXT_MODEL_FALLBACKS: '',
      OPENROUTER_AGENT_STRUCTURE_ROUTES: 'openai/gpt-4o-mini'
    }, async () => {
      const { chatComplete: completeWithFallback } = loadClient();
      const responseFormat = {
        type: 'json_schema',
        json_schema: {
          name: 'plan',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'operations'],
            properties: {
              title: { type: 'string' },
              operations: { type: 'array', minItems: 1, items: { type: 'string' } }
            }
          }
        }
      };
      await withStubbedFetch(
        (_payload, _callNumber, url) => String(url).includes('openrouter.ai')
          ? jsonResponse(200, completion('{"title":"Incomplete","operations":[]}'))
          : jsonResponse(200, completion('{"title":"Complete","operations":["move"]}')),
        async () => {
          const result = await completeWithFallback({
            route: 'structure_planner',
            responseFormat,
            messages: [{ role: 'user', content: 'organize this workspace' }]
          });
          assert.equal(result.upstream, 'huggingface');
          assert.deepEqual(
            result.upstreamAttempts.map(({ upstream, status, reason }) => ({ upstream, status, reason })),
            [
              { upstream: 'openrouter', status: 'failed', reason: 'invalid_output' },
              { upstream: 'huggingface', status: 'succeeded', reason: undefined }
            ]
          );
        }
      );
    });

    // 9. Streaming is fail-closed too: rejected model text is buffered and
    //    never reaches the caller's delta callback.
    await withStubbedFetch(
      () => streamingResponse('Reasoning: hidden chain of thought'),
      async () => {
        const deltas = [];
        const { chatCompleteStream } = loadClient();
        await assert.rejects(
          () => chatCompleteStream({
            route: 'partner_chat',
            messages: [{ role: 'user', content: 'answer safely' }],
            onDelta: delta => deltas.push(delta)
          }),
          error => error.status === 502
        );
        assert.deepEqual(deltas, []);
      }
    );

    // 10. A valid buffered stream is released exactly once after validation.
    await withStubbedFetch(
      () => streamingResponse('A grounded answer.'),
      async () => {
        const deltas = [];
        const { chatCompleteStream } = loadClient();
        const result = await chatCompleteStream({
          route: 'partner_chat',
          messages: [{ role: 'user', content: 'answer safely' }],
          onDelta: delta => deltas.push(delta)
        });
        assert.equal(result.text, 'A grounded answer.');
        assert.deepEqual(deltas, ['A grounded answer.']);
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
