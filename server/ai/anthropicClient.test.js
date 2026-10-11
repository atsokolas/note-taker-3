const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// One local server plays both upstreams: /v1/messages is Claude (streamed
// events, the way the real SDK reads them) and /v1/chat/completions is
// OpenRouter. Each test says what Claude answers.
let claudeReply = null;
const seen = { claude: [], router: [] };

const sse = (events) => events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`).join('');
const claudeStream = (blocks, stopReason) => sse([
  ['message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
  ...blocks.flatMap((block, index) => (block.type === 'text'
    ? [
      ['content_block_start', { index, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { index, delta: { type: 'text_delta', text: block.text } }],
      ['content_block_stop', { index }]
    ]
    : [
      ['content_block_start', { index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } }],
      ['content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } }],
      ['content_block_stop', { index }]
    ])),
  ['message_delta', { delta: { stop_reason: stopReason }, usage: { output_tokens: 5 } }],
  ['message_stop', {}]
]);

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    if (req.url.startsWith('/v1/messages')) {
      seen.claude.push({ body, headers: req.headers });
      const reply = claudeReply;
      if (reply.status) {
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: reply.message } }));
      }
      if (reply.hang) return undefined;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end(claudeStream(reply.blocks, reply.stopReason || 'end_turn'));
    }
    seen.router.push(body);
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'From the router.' } }] })}\n\ndata: [DONE]\n\n`);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { content: 'From the router.' }, finish_reason: 'stop' }] }));
  });
});

let client;
test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  Object.assign(process.env, {
    ANTHROPIC_API_KEY: 'test-claude-key',
    ANTHROPIC_BASE_URL: base,
    OPENROUTER_API_KEY: 'test-router-key',
    OPENROUTER_BASE_URL: `${base}/v1`,
    OPENROUTER_TEXT_MODEL: 'anthropic/claude-sonnet-5',
    OPENROUTER_TEXT_MODEL_FALLBACKS: ''
  });
  delete process.env.ANTHROPIC_TEXT_MODEL;
  delete process.env.AI_TEXT_UPSTREAM;
  delete process.env.HF_TOKEN;
  client = require('./hfTextClient');
});
test.after(() => server.close());
test.beforeEach(() => {
  seen.claude.length = 0;
  seen.router.length = 0;
});

test('a tool round goes to Claude as tool_use and tool_result, and its call comes back in the chat shape', async () => {
  claudeReply = { blocks: [{ type: 'text', text: 'Let me look.' }, { type: 'tool_use', id: 'toolu_2', name: 'search_library', input: { query: 'moats' } }], stopReason: 'tool_use' };
  const tools = [{ type: 'function', function: { name: 'search_library', description: 'Search', parameters: { type: 'object', properties: { query: { type: 'string' } } } } }];
  const completion = await client.chatComplete({
    route: 'partner_chat',
    tools,
    toolChoice: 'auto',
    messages: [
      { role: 'system', content: 'You are the Partner.' },
      { role: 'user', content: 'What do I hold on moats?' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'toolu_1', type: 'function', function: { name: 'search_library', arguments: '{"query":"moat"}' } }] },
      { role: 'tool', tool_call_id: 'toolu_1', content: '{"result":"Nothing."}' }
    ]
  });

  const sent = seen.claude[0];
  assert.strictEqual(sent.headers['x-api-key'], 'test-claude-key');
  assert.strictEqual(sent.body.model, 'claude-sonnet-5');
  assert.strictEqual(sent.body.system, 'You are the Partner.');
  assert.deepStrictEqual(sent.body.messages, [
    { role: 'user', content: 'What do I hold on moats?' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'search_library', input: { query: 'moat' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"result":"Nothing."}' }] }
  ]);
  assert.deepStrictEqual(sent.body.tools, [{ name: 'search_library', description: 'Search', input_schema: tools[0].function.parameters }]);
  assert.deepStrictEqual(sent.body.tool_choice, { type: 'auto' });
  assert.deepStrictEqual(sent.body.thinking, { type: 'disabled' });
  assert.strictEqual(sent.body.max_tokens, 1200);
  assert.strictEqual(sent.body.temperature, undefined);

  assert.strictEqual(completion.upstream, 'anthropic');
  assert.strictEqual(completion.text, 'Let me look.');
  assert.deepStrictEqual(completion.toolCalls, [{ id: 'toolu_2', type: 'function', function: { name: 'search_library', arguments: '{"query":"moats"}' } }]);
  assert.strictEqual(completion.raw.choices[0].finish_reason, 'tool_calls');
  assert.strictEqual(seen.router.length, 0);
});

test('an answer cut at the token cap reads as cut off', async () => {
  claudeReply = { blocks: [{ type: 'text', text: 'Half an' }], stopReason: 'max_tokens' };
  const completion = await client.chatComplete({ messages: [{ role: 'user', content: 'Go on.' }] });
  assert.strictEqual(completion.raw.choices[0].finish_reason, 'length');
});

test('when the Claude credit runs out, the same request goes to OpenRouter', async () => {
  claudeReply = { status: 400, message: 'Your credit balance is too low to access the Anthropic API.' };
  const completion = await client.chatComplete({ messages: [{ role: 'user', content: 'Hello' }] });
  assert.strictEqual(completion.text, 'From the router.');
  assert.strictEqual(completion.upstream, 'openrouter');
  assert.strictEqual(seen.router[0].model, 'anthropic/claude-sonnet-5');
  assert.deepStrictEqual(completion.upstreamAttempts.map(attempt => [attempt.upstream, attempt.status]), [['anthropic', 'failed'], ['openrouter', 'succeeded']]);
});

test('a refusal, even after partial text, goes to OpenRouter', async () => {
  claudeReply = { blocks: [{ type: 'text', text: 'I can start, but' }], stopReason: 'refusal' };
  const completion = await client.chatComplete({ messages: [{ role: 'user', content: 'Hello' }] });
  assert.strictEqual(completion.text, 'From the router.');
});

test('a revoked key falls back too', async () => {
  claudeReply = { status: 401, message: 'invalid x-api-key' };
  const completion = await client.chatComplete({ messages: [{ role: 'user', content: 'Hello' }] });
  assert.strictEqual(completion.upstream, 'openrouter');
});

test('a stream request is answered whole by Claude', async () => {
  claudeReply = { blocks: [{ type: 'text', text: '{"title":"Moats"}' }] };
  const deltas = [];
  const completion = await client.chatCompleteStream({
    route: 'structure_planner',
    messages: [{ role: 'user', content: 'Plan it.' }],
    onDelta: delta => deltas.push(delta)
  });
  assert.strictEqual(completion.text, '{"title":"Moats"}');
  assert.deepStrictEqual(deltas, ['{"title":"Moats"}']);
  assert.strictEqual(seen.router.length, 0);
});

test('a stream request Claude cannot answer goes to the router', async () => {
  claudeReply = { status: 429, message: 'rate_limit_error' };
  const completion = await client.chatCompleteStream({ messages: [{ role: 'user', content: 'Hello' }] });
  assert.strictEqual(completion.text, 'From the router.');
});

test('a reader who stops the request is not answered by the router instead', async () => {
  claudeReply = { hang: true };
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(
    client.chatComplete({ messages: [{ role: 'user', content: 'Hello' }], signal: controller.signal }),
    error => error.status === 499
  );
  assert.strictEqual(seen.router.length, 0);
});

test('with no Claude key nothing changes', async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const completion = await client.chatComplete({ messages: [{ role: 'user', content: 'Hello' }] });
    assert.strictEqual(completion.upstream, 'openrouter');
    assert.strictEqual(seen.claude.length, 0);
  } finally {
    process.env.ANTHROPIC_API_KEY = key;
  }
});
