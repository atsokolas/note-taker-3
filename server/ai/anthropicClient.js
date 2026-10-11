const Anthropic = require('@anthropic-ai/sdk');

// Claude, called directly. The rest of the text client speaks the chat
// completions shape, so this file translates a request into the Messages API
// and the answer back, and nothing above it has to know which upstream spoke.

const DEFAULT_ANTHROPIC_TEXT_MODEL = 'claude-sonnet-5';

let cached = { token: '', client: null };
const clientFor = (token) => {
  if (cached.token !== token) cached = { token, client: new Anthropic({ apiKey: token, maxRetries: 1 }) };
  return cached.client;
};

const parseArguments = (value) => {
  try {
    return JSON.parse(value || '{}');
  } catch (_error) {
    return {};
  }
};

// System turns become the system prompt; an assistant turn's tool calls become
// tool_use blocks; a tool turn becomes the tool_result that answers it by id.
const toMessagesRequest = (messages = []) => ({
  system: messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n'),
  messages: messages.filter(message => message.role !== 'system').map((message) => {
    if (message.role === 'tool') {
      return { role: 'user', content: [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content }] };
    }
    if (message.tool_calls) {
      return {
        role: 'assistant',
        content: [
          ...(message.content ? [{ type: 'text', text: message.content }] : []),
          ...message.tool_calls.map(call => ({
            type: 'tool_use',
            id: call.id,
            name: call.function?.name,
            input: parseArguments(call.function?.arguments)
          }))
        ]
      };
    }
    return { role: message.role, content: message.content };
  })
});

const toolsFor = (tools = []) => tools.map(({ function: fn }) => ({
  name: fn.name,
  description: fn.description || '',
  input_schema: fn.parameters || { type: 'object', properties: {} }
}));

const toolChoiceFor = (choice) => {
  if (!choice) return undefined;
  if (choice.function?.name) return { type: 'tool', name: choice.function.name };
  return { type: choice === 'required' ? 'any' : choice };
};

const FINISH_REASONS = { max_tokens: 'length', tool_use: 'tool_calls' };

const toChatCompletion = (message) => {
  const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('');
  const toolCalls = message.content.filter(block => block.type === 'tool_use').map(block => ({
    id: block.id,
    type: 'function',
    function: { name: block.name, arguments: JSON.stringify(block.input || {}) }
  }));
  return {
    id: message.id,
    model: message.model,
    choices: [{
      message: { role: 'assistant', content: text, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
      finish_reason: FINISH_REASONS[message.stop_reason] || 'stop'
    }],
    usage: message.usage
  };
};

// Sampling and reasoning hints are left behind: current Claude models refuse
// temperature, and thinking stays off so the token caps each route sets go to
// the answer, as they did when the same model came through OpenRouter.
// Streamed and collected so long drafts never hit a response timeout.
const requestAnthropic = async ({ token, model, timeoutMs, payload = {}, signal }) => {
  const tools = Array.isArray(payload.tools) && payload.tools.length ? toolsFor(payload.tools) : null;
  const { system, messages } = toMessagesRequest(payload.messages);
  try {
    const message = await clientFor(token).messages.stream({
      model,
      max_tokens: payload.max_tokens || 1024,
      ...(system ? { system } : {}),
      messages,
      thinking: { type: 'disabled' },
      ...(tools ? { tools, tool_choice: toolChoiceFor(payload.tool_choice) || { type: 'auto' } } : {})
    }, { signal, timeout: timeoutMs }).finalMessage();
    // A refusal arrives as a 200, sometimes after partial text; it is not an answer.
    if (message.stop_reason === 'refusal') throw Object.assign(new Error('Claude declined to answer.'), { status: 502 });
    return { body: toChatCompletion(message), model, provider: '' };
  } catch (error) {
    const aborted = signal?.aborted || error instanceof Anthropic.APIUserAbortError;
    const status = aborted ? 499 : error instanceof Anthropic.APIConnectionTimeoutError ? 504 : Number(error?.status) || 502;
    const detail = String(error?.error?.error?.message || error?.message || 'anthropic request failed');
    const failure = new Error(detail);
    failure.status = status;
    failure.payload = { error: status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_FAILED', detail, message: detail, provider: '', model, upstream: 'anthropic' };
    throw failure;
  }
};

module.exports = {
  DEFAULT_ANTHROPIC_TEXT_MODEL,
  requestAnthropic,
  __testables: { toMessagesRequest, toChatCompletion, toolChoiceFor }
};
