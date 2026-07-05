const assert = require('assert');

const loadClient = () => {
  const clientPath = require.resolve('./hfTextClient');
  delete require.cache[clientPath];
  return require('./hfTextClient');
};

const run = () => {
  const originalEnv = {
    HF_PROVIDER: process.env.HF_PROVIDER,
    HF_AGENT_CHAT_ROUTES: process.env.HF_AGENT_CHAT_ROUTES,
    HF_AGENT_MODEL_ROUTES_JSON: process.env.HF_AGENT_MODEL_ROUTES_JSON,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_TEXT_MODEL: process.env.OPENROUTER_TEXT_MODEL,
    OPENROUTER_TEXT_MODEL_FALLBACKS: process.env.OPENROUTER_TEXT_MODEL_FALLBACKS,
    OPENROUTER_AGENT_CHAT_ROUTES: process.env.OPENROUTER_AGENT_CHAT_ROUTES,
    OPENROUTER_AGENT_MODEL_ROUTES_JSON: process.env.OPENROUTER_AGENT_MODEL_ROUTES_JSON
  };

  try {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_TEXT_MODEL;
    delete process.env.OPENROUTER_TEXT_MODEL_FALLBACKS;
    delete process.env.OPENROUTER_AGENT_CHAT_ROUTES;
    delete process.env.OPENROUTER_AGENT_MODEL_ROUTES_JSON;
    process.env.HF_PROVIDER = 'groq';
    delete process.env.HF_AGENT_CHAT_ROUTES;
    delete process.env.HF_AGENT_MODEL_ROUTES_JSON;

    const client = loadClient();
    const { parseRouteEntry, parseRouteList, mergeCandidateRoutes } = client.__testables;

    assert.deepStrictEqual(
      parseRouteEntry('openai/gpt-oss-120b:cerebras', 'groq'),
      { model: 'openai/gpt-oss-120b', provider: 'cerebras' },
      'Provider suffix should override the default provider.'
    );

    assert.deepStrictEqual(
      parseRouteEntry('Qwen/Qwen3-Next-80B-A3B-Instruct', 'novita'),
      { model: 'Qwen/Qwen3-Next-80B-A3B-Instruct', provider: 'novita' },
      'Unsuffixed routes should inherit the default provider.'
    );

    assert.deepStrictEqual(
      parseRouteList('openai/gpt-oss-120b:groq,Qwen/Qwen3-Coder-Next@novita', 'groq'),
      [
        { model: 'openai/gpt-oss-120b', provider: 'groq' },
        { model: 'Qwen/Qwen3-Coder-Next', provider: 'novita' }
      ],
      'Route lists should support both model:provider and model@provider forms.'
    );

    assert.deepStrictEqual(
      mergeCandidateRoutes(
        ['openai/gpt-oss-120b:groq', 'openai/gpt-oss-120b:groq'],
        [{ model: 'openai/gpt-oss-120b', provider: 'cerebras' }]
      ),
      [
        { model: 'openai/gpt-oss-120b', provider: 'groq' },
        { model: 'openai/gpt-oss-120b', provider: 'cerebras' }
      ],
      'Candidate merging should de-duplicate model/provider pairs while keeping provider fallbacks.'
    );

    const config = client.getConfig();
    assert.strictEqual(
      config.routeProfiles.partner_chat[0].model,
      'openai/gpt-oss-120b',
      'Default partner chat route should use gpt-oss as controller.'
    );
    assert.strictEqual(
      config.routeProfiles.partner_chat[0].provider,
      'groq',
      'Default partner chat route should start on Groq.'
    );

    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.OPENROUTER_TEXT_MODEL = 'openai/gpt-4o-mini';
    process.env.OPENROUTER_TEXT_MODEL_FALLBACKS = 'google/gemini-2.5-flash';
    process.env.OPENROUTER_AGENT_CHAT_ROUTES = 'anthropic/claude-3.5-haiku,openai/gpt-4o-mini';
    const openRouterClient = loadClient();
    const openRouterConfig = openRouterClient.getConfig();
    assert.strictEqual(openRouterConfig.upstream, 'openrouter');
    assert.strictEqual(openRouterConfig.token, 'test-openrouter-key');
    assert.strictEqual(openRouterConfig.model, 'openai/gpt-4o-mini');
    assert.strictEqual(openRouterConfig.provider, '');
    assert.strictEqual(openRouterConfig.routerBaseUrl, 'https://openrouter.ai/api/v1');
    assert.deepStrictEqual(
      openRouterConfig.textModelFallbacks,
      ['google/gemini-2.5-flash']
    );
    assert.deepStrictEqual(
      openRouterConfig.routeProfiles.partner_chat.slice(0, 2),
      [
        { model: 'anthropic/claude-3.5-haiku', provider: '' },
        { model: 'openai/gpt-4o-mini', provider: '' }
      ],
      'OpenRouter route env should override default route order without HF providers.'
    );
  } finally {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
};

if (require.main === module) {
  try {
    run();
    console.log('hfTextClient tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
