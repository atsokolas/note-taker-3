const DEFAULT_TEXT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_PROVIDER = 'groq';
const DEFAULT_OPENROUTER_TEXT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TEXT_MODEL_FALLBACKS = [
  'openai/gpt-oss-120b:cerebras',
  'openai/gpt-oss-120b:fireworks-ai',
  'Qwen/Qwen3-Next-80B-A3B-Instruct:novita'
];
const DEFAULT_OPENROUTER_TEXT_MODEL_FALLBACKS = [
  'google/gemini-2.5-flash'
];

const DEFAULT_ROUTE_PROFILES = Object.freeze({
  partner_chat: [
    'openai/gpt-oss-120b:groq',
    'openai/gpt-oss-120b:cerebras',
    'openai/gpt-oss-120b:fireworks-ai',
    'Qwen/Qwen3-Next-80B-A3B-Instruct:novita'
  ],
  tool_router: [
    'openai/gpt-oss-120b:groq',
    'openai/gpt-oss-120b:cerebras',
    'openai/gpt-oss-120b:fireworks-ai',
    'Qwen/Qwen3-Coder-Next:novita'
  ],
  structure_planner: [
    'openai/gpt-oss-120b:groq',
    'openai/gpt-oss-120b:cerebras',
    'openai/gpt-oss-120b:fireworks-ai',
    'google/gemma-4-26B-A4B-it:novita'
  ],
  artifact_draft: [
    'openai/gpt-oss-120b:groq',
    'openai/gpt-oss-120b:cerebras',
    'openai/gpt-oss-120b:fireworks-ai',
    'Qwen/Qwen3-Next-80B-A3B-Instruct:novita'
  ],
  critique: [
    'openai/gpt-oss-120b:groq',
    'openai/gpt-oss-120b:cerebras',
    'Qwen/Qwen3-Next-80B-A3B-Thinking:novita'
  ],
  hygiene_scan: [
    'openai/gpt-oss-120b:groq',
    'openai/gpt-oss-120b:cerebras',
    'openai/gpt-oss-120b:fireworks-ai',
    'google/gemma-4-26B-A4B-it:novita'
  ],
  deep_audit: [
    'Qwen/Qwen3-Next-80B-A3B-Thinking:novita',
    'deepseek-ai/DeepSeek-V4-Pro:together',
    'openai/gpt-oss-120b:groq'
  ]
});

const ROUTE_ENV_KEYS = Object.freeze({
  partner_chat: 'HF_AGENT_CHAT_ROUTES',
  tool_router: 'HF_AGENT_TOOL_ROUTES',
  structure_planner: 'HF_AGENT_STRUCTURE_ROUTES',
  artifact_draft: 'HF_AGENT_ARTIFACT_ROUTES',
  critique: 'HF_AGENT_CRITIQUE_ROUTES',
  hygiene_scan: 'HF_AGENT_HYGIENE_ROUTES',
  deep_audit: 'HF_AGENT_DEEP_AUDIT_ROUTES'
});

const OPENROUTER_ROUTE_ENV_KEYS = Object.freeze({
  partner_chat: 'OPENROUTER_AGENT_CHAT_ROUTES',
  tool_router: 'OPENROUTER_AGENT_TOOL_ROUTES',
  structure_planner: 'OPENROUTER_AGENT_STRUCTURE_ROUTES',
  artifact_draft: 'OPENROUTER_AGENT_ARTIFACT_ROUTES',
  critique: 'OPENROUTER_AGENT_CRITIQUE_ROUTES',
  hygiene_scan: 'OPENROUTER_AGENT_HYGIENE_ROUTES',
  deep_audit: 'OPENROUTER_AGENT_DEEP_AUDIT_ROUTES'
});

const parseModelFallbacks = (value = '', primaryModel = '') => {
  const seen = new Set([String(primaryModel || '').trim()]);
  return String(value || '')
    .split(',')
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
};

const parseRouteEntry = (entry = {}, defaultProvider = '') => {
  if (entry && typeof entry === 'object') {
    const model = String(entry.model || '').trim();
    const provider = String(entry.provider || defaultProvider || '').trim();
    if (!model) return null;
    return { model, provider };
  }
  const raw = String(entry || '').trim();
  if (!raw) return null;
  const separator = raw.includes('@') ? raw.lastIndexOf('@') : raw.lastIndexOf(':');
  if (separator > 0 && separator < raw.length - 1) {
    return {
      model: raw.slice(0, separator).trim(),
      provider: raw.slice(separator + 1).trim()
    };
  }
  return {
    model: raw,
    provider: String(defaultProvider || '').trim()
  };
};

const parseRouteList = (value = '', defaultProvider = '') => (
  String(value || '')
    .split(',')
    .map((entry) => parseRouteEntry(entry, defaultProvider))
    .filter(Boolean)
);

const mergeCandidateRoutes = (...lists) => {
  const seen = new Set();
  const ordered = [];
  lists.flat().forEach((entry) => {
    const route = parseRouteEntry(entry);
    if (!route?.model) return;
    const key = `${route.model}:${route.provider || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(route);
  });
  return ordered;
};

const parseJsonRouteProfiles = (value = '', defaultProvider = '') => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce((acc, [profile, routes]) => {
      const safeProfile = String(profile || '').trim();
      if (!safeProfile) return acc;
      if (Array.isArray(routes)) {
        acc[safeProfile] = routes.map((entry) => parseRouteEntry(entry, defaultProvider)).filter(Boolean);
      } else if (typeof routes === 'string') {
        acc[safeProfile] = parseRouteList(routes, defaultProvider);
      }
      return acc;
    }, {});
  } catch (_err) {
    return {};
  }
};

const buildOpenRouterDefaultRouteProfiles = (primaryModel = DEFAULT_OPENROUTER_TEXT_MODEL, fallbacks = DEFAULT_OPENROUTER_TEXT_MODEL_FALLBACKS) => {
  const routes = mergeCandidateRoutes([primaryModel, ...(Array.isArray(fallbacks) ? fallbacks : [])]);
  return Object.keys(DEFAULT_ROUTE_PROFILES).reduce((acc, profile) => {
    acc[profile] = routes;
    return acc;
  }, {});
};

const getConfiguredRouteProfiles = (provider = DEFAULT_PROVIDER, { upstream = 'huggingface', primaryModel = '', fallbacks = [] } = {}) => {
  const isOpenRouter = upstream === 'openrouter';
  const jsonProfiles = parseJsonRouteProfiles(
    isOpenRouter
      ? (process.env.OPENROUTER_AGENT_MODEL_ROUTES_JSON || '')
      : (process.env.HF_AGENT_MODEL_ROUTES_JSON || ''),
    isOpenRouter ? '' : provider
  );
  const defaultProfiles = isOpenRouter
    ? buildOpenRouterDefaultRouteProfiles(primaryModel || DEFAULT_OPENROUTER_TEXT_MODEL, fallbacks)
    : DEFAULT_ROUTE_PROFILES;
  const routeEnvKeys = isOpenRouter ? OPENROUTER_ROUTE_ENV_KEYS : ROUTE_ENV_KEYS;
  return Object.keys(DEFAULT_ROUTE_PROFILES).reduce((acc, profile) => {
    const envKey = routeEnvKeys[profile];
    const envRoutes = envKey ? parseRouteList(process.env[envKey] || '', isOpenRouter ? '' : provider) : [];
    const jsonRoutes = Array.isArray(jsonProfiles[profile]) ? jsonProfiles[profile] : [];
    const defaultRoutes = (defaultProfiles[profile] || [])
      .map((entry) => parseRouteEntry(entry, isOpenRouter ? '' : provider))
      .filter(Boolean);
    acc[profile] = mergeCandidateRoutes(envRoutes, jsonRoutes, defaultRoutes);
    return acc;
  }, {});
};

const getConfig = () => {
  const openRouterToken = process.env.OPENROUTER_API_KEY || '';
  const useOpenRouter = Boolean(String(openRouterToken || '').trim());
  const model = useOpenRouter
    ? (process.env.OPENROUTER_TEXT_MODEL || DEFAULT_OPENROUTER_TEXT_MODEL)
    : (process.env.HF_TEXT_MODEL || DEFAULT_TEXT_MODEL);
  const textModelFallbacks = useOpenRouter
    ? parseModelFallbacks(
      process.env.OPENROUTER_TEXT_MODEL_FALLBACKS || DEFAULT_OPENROUTER_TEXT_MODEL_FALLBACKS.join(','),
      model
    )
    : parseModelFallbacks(
      process.env.HF_TEXT_MODEL_FALLBACKS || DEFAULT_TEXT_MODEL_FALLBACKS.join(','),
      model
    );
  const provider = useOpenRouter ? '' : (process.env.HF_PROVIDER || DEFAULT_PROVIDER);
  const timeoutMs = Number(
    useOpenRouter
      ? (process.env.OPENROUTER_TIMEOUT_MS || process.env.HF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
      : (process.env.HF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  );
  const routerBaseUrl = useOpenRouter
    ? (process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL)
    : (process.env.HF_ROUTER_BASE_URL || DEFAULT_ROUTER_BASE_URL);
  const upstream = useOpenRouter ? 'openrouter' : 'huggingface';
  return {
    token: useOpenRouter ? openRouterToken : (process.env.HF_TOKEN || ''),
    model,
    textModelFallbacks,
    provider,
    timeoutMs,
    routerBaseUrl,
    upstream,
    referer: process.env.OPENROUTER_HTTP_REFERER || process.env.APP_URL || process.env.PUBLIC_APP_URL || 'https://www.noeis.io',
    appTitle: process.env.OPENROUTER_APP_TITLE || 'Noeis',
    routeProfiles: getConfiguredRouteProfiles(provider, { upstream, primaryModel: model, fallbacks: textModelFallbacks })
  };
};

const startupConfig = getConfig();
console.log('[AI] text client', {
  upstream: startupConfig.upstream,
  model: startupConfig.model,
  textModelFallbacks: startupConfig.textModelFallbacks,
  provider: startupConfig.provider,
  timeoutMs: startupConfig.timeoutMs,
  routerBaseUrl: startupConfig.routerBaseUrl
});

const readTextSafely = async (response) => {
  try {
    return await response.text();
  } catch (_err) {
    return '';
  }
};

const parseJsonSafely = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
};

const stripThinkBlocks = (value = '') => (
  String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/```(?:thinking|thought|reasoning)[\s\S]*?```/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const buildError = ({ status, message, detail = '', provider = '', model = '', upstream = 'huggingface' }) => {
  const error = new Error(message);
  error.status = status;
  error.payload = {
    error: status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_FAILED',
    detail,
    message,
    provider,
    model,
    upstream
  };
  return error;
};

const requestHeadersFor = ({ token, upstream = 'huggingface', stream = false, referer = '', appTitle = '' } = {}) => {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json'
  };
  if (upstream === 'openrouter') {
    if (referer) headers['HTTP-Referer'] = referer;
    if (appTitle) headers['X-OpenRouter-Title'] = appTitle;
  }
  return headers;
};

const requestPayloadFor = ({ payload = {}, upstream = 'huggingface', provider = '', withProvider = false } = {}) => {
  const nextPayload = { ...payload };
  if (upstream !== 'huggingface') {
    delete nextPayload.reasoning_effort;
  }
  if (withProvider && provider && upstream === 'huggingface') {
    nextPayload.provider = provider;
  }
  return nextPayload;
};

const requestChatCompletions = async ({
  token,
  model,
  provider,
  timeoutMs,
  routerBaseUrl,
  upstream = 'huggingface',
  referer = '',
  appTitle = '',
  payload,
  signal
}) => {
  const url = `${String(routerBaseUrl || DEFAULT_ROUTER_BASE_URL).replace(/\/+$/, '')}/chat/completions`;
  const basePayload = {
    model,
    stream: false,
    ...payload
  };
  const attempts = [
    { withProvider: Boolean(provider) },
    { withProvider: false }
  ];

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (!attempt.withProvider && index === 1 && !provider) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestPayload = requestPayloadFor({ payload: basePayload, upstream, provider, withProvider: attempt.withProvider });
      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeadersFor({ token, upstream, referer, appTitle }),
        body: JSON.stringify(requestPayload),
        signal: signal || controller.signal
      });
      const rawText = await readTextSafely(response);
      const json = parseJsonSafely(rawText);

      if (!response.ok) {
        const detail = typeof json?.detail === 'string'
          ? json.detail
          : typeof json?.error === 'string'
            ? json.error
            : rawText || `HF request failed with status ${response.status}`;
        const lowerDetail = String(detail || '').toLowerCase();
        const providerFieldUnsupported = attempt.withProvider
          && response.status >= 400
          && response.status < 500
          && lowerDetail.includes('provider')
          && (lowerDetail.includes('unknown field') || lowerDetail.includes('extra inputs') || lowerDetail.includes('not permitted'));
        if (providerFieldUnsupported) {
          continue;
        }
        throw buildError({
          status: response.status,
          detail,
          message: detail,
          provider: attempt.withProvider ? provider : '',
          model,
          upstream
        });
      }

      return {
        response,
        body: json ?? rawText,
        model,
        provider: attempt.withProvider ? provider : ''
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw buildError({
          status: signal?.aborted ? 499 : 504,
          detail: signal?.aborted ? `${upstream} request aborted` : `${upstream} request timed out`,
          message: signal?.aborted ? `${upstream} request aborted` : `${upstream} request timed out after ${timeoutMs}ms`,
          provider,
          model,
          upstream
        });
      }
      if (error?.payload || error?.status) throw error;
      throw buildError({
        status: 502,
        detail: String(error?.message || `${upstream} request failed`),
        message: `${upstream} request failed: ${error?.message || 'Unknown error'}`,
        provider,
        model,
        upstream
      });
    } finally {
      clearTimeout(timer);
    }
  }

  throw buildError({
    status: 502,
    detail: `${upstream} request failed`,
    message: `${upstream} request failed without a usable response.`,
    provider,
    model,
    upstream
  });
};

const requestChatCompletionsStream = async ({
  token,
  model,
  provider,
  timeoutMs,
  routerBaseUrl,
  upstream = 'huggingface',
  referer = '',
  appTitle = '',
  payload,
  signal
}) => {
  const url = `${String(routerBaseUrl || DEFAULT_ROUTER_BASE_URL).replace(/\/+$/, '')}/chat/completions`;
  const basePayload = {
    model,
    stream: true,
    ...payload
  };
  const attempts = [
    { withProvider: Boolean(provider) },
    { withProvider: false }
  ];

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (!attempt.withProvider && index === 1 && !provider) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestPayload = requestPayloadFor({ payload: basePayload, upstream, provider, withProvider: attempt.withProvider });
      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeadersFor({ token, upstream, stream: true, referer, appTitle }),
        body: JSON.stringify(requestPayload),
        signal: signal || controller.signal
      });

      if (!response.ok) {
        const rawText = await readTextSafely(response);
        const json = parseJsonSafely(rawText);
        const detail = typeof json?.detail === 'string'
          ? json.detail
          : typeof json?.error === 'string'
            ? json.error
            : rawText || `HF request failed with status ${response.status}`;
        const lowerDetail = String(detail || '').toLowerCase();
        const providerFieldUnsupported = attempt.withProvider
          && response.status >= 400
          && response.status < 500
          && lowerDetail.includes('provider')
          && (lowerDetail.includes('unknown field') || lowerDetail.includes('extra inputs') || lowerDetail.includes('not permitted'));
        if (providerFieldUnsupported) continue;
        throw buildError({
          status: response.status,
          detail,
          message: detail,
          provider: attempt.withProvider ? provider : '',
          model,
          upstream
        });
      }

      return {
        response,
        model,
        provider: attempt.withProvider ? provider : ''
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw buildError({
          status: signal?.aborted ? 499 : 504,
          detail: signal?.aborted ? `${upstream} request aborted` : `${upstream} request timed out`,
          message: signal?.aborted ? `${upstream} request aborted` : `${upstream} request timed out after ${timeoutMs}ms`,
          provider,
          model,
          upstream
        });
      }
      if (error?.payload || error?.status) throw error;
      throw buildError({
        status: 502,
        detail: String(error?.message || `${upstream} request failed`),
        message: `${upstream} request failed: ${error?.message || 'Unknown error'}`,
        provider,
        model,
        upstream
      });
    } finally {
      clearTimeout(timer);
    }
  }

  throw buildError({
    status: 502,
    detail: `${upstream} streaming request failed`,
    message: `${upstream} streaming request failed without a usable response.`,
    provider,
    model,
    upstream
  });
};

const extractChatContent = (body) => {
  if (!body) return '';
  if (typeof body === 'string') return stripThinkBlocks(body);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return stripThinkBlocks(content);
  if (Array.isArray(content)) {
    return stripThinkBlocks(
      content
        .map((item) => item?.text || item?.content || '')
        .filter(Boolean)
        .join(' ')
    );
  }
  return '';
};

const extractDeltaContent = (payload) => {
  const delta = payload?.choices?.[0]?.delta?.content;
  if (typeof delta === 'string') return delta;
  if (Array.isArray(delta)) {
    return delta.map(item => item?.text || item?.content || '').filter(Boolean).join('');
  }
  const text = payload?.choices?.[0]?.text;
  return typeof text === 'string' ? text : '';
};

const isTextGenerationConfigured = () => {
  const { token, model, routeProfiles } = getConfig();
  const hasProfileRoute = Object.values(routeProfiles || {}).some((routes) => (
    Array.isArray(routes) && routes.some((route) => route?.model)
  ));
  return Boolean(String(token || '').trim() && (String(model || '').trim() || hasProfileRoute));
};

const chatComplete = async ({
  messages = [],
  temperature = 0.35,
  maxTokens = 260,
  reasoningEffort = 'medium',
  fallbackModels = [],
  preferFallbackModels = false,
  route = '',
  modelRoutes = [],
  responseFormat = null,
  tools = null,
  toolChoice = null
} = {}) => {
  const {
    token,
    model,
    textModelFallbacks,
    provider,
    timeoutMs,
    routerBaseUrl,
    routeProfiles,
    upstream,
    referer,
    appTitle
  } = getConfig();
  if (!token) {
    const tokenName = upstream === 'openrouter' ? 'OPENROUTER_API_KEY' : 'HF_TOKEN';
    throw buildError({
      status: 401,
      detail: `${tokenName} not configured`,
      message: `${tokenName} not configured`,
      provider,
      model,
      upstream
    });
  }
  if (!model) {
    const modelName = upstream === 'openrouter' ? 'OPENROUTER_TEXT_MODEL' : 'HF_TEXT_MODEL';
    throw buildError({
      status: 500,
      detail: `${modelName} not configured`,
      message: `${modelName} not configured`,
      provider,
      model,
      upstream
    });
  }

  const safeMessages = Array.isArray(messages)
    ? messages
        .map((entry) => ({
          role: String(entry?.role || '').trim(),
          content: String(entry?.content || '').trim()
        }))
        .filter((entry) => entry.role && entry.content)
    : [];
  if (safeMessages.length === 0) {
    throw buildError({
      status: 400,
      detail: `${upstream} chat requires at least one message`,
      message: `${upstream} chat requires at least one message`,
      provider,
      model,
      upstream
    });
  }

  const preferredFallbacks = Array.isArray(fallbackModels) ? fallbackModels : [];
  const configuredFallbacks = Array.isArray(textModelFallbacks) ? textModelFallbacks : [];
  const explicitRoutes = Array.isArray(modelRoutes) ? modelRoutes : [];
  const profileRoutes = route && Array.isArray(routeProfiles?.[route]) ? routeProfiles[route] : [];
  const legacyRoutes = [
    parseRouteEntry({ model, provider }),
    ...configuredFallbacks.map((entry) => parseRouteEntry(entry, provider))
  ].filter(Boolean);
  const candidateRoutes = explicitRoutes.length > 0
    ? mergeCandidateRoutes(explicitRoutes, preferredFallbacks)
    : profileRoutes.length > 0
      ? mergeCandidateRoutes(preferFallbackModels ? preferredFallbacks : [], profileRoutes, preferFallbackModels ? [] : preferredFallbacks)
      : preferFallbackModels
        ? mergeCandidateRoutes(preferredFallbacks, legacyRoutes)
        : mergeCandidateRoutes(legacyRoutes, preferredFallbacks);
  let lastError = null;

  for (const candidateRoute of candidateRoutes) {
    const candidateModel = candidateRoute.model;
    const candidateProvider = candidateRoute.provider || provider;
    try {
      const { body, provider: resolvedProvider } = await requestChatCompletions({
        token,
        model: candidateModel,
        provider: candidateProvider,
        timeoutMs,
        routerBaseUrl,
        upstream,
        referer,
        appTitle,
        payload: {
          messages: safeMessages,
          temperature,
          max_tokens: maxTokens,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
          ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {})
        }
      });

      const text = extractChatContent(body);
      const toolCalls = Array.isArray(body?.choices?.[0]?.message?.tool_calls)
        ? body.choices[0].message.tool_calls
        : [];
      if (!text && toolCalls.length === 0) {
        throw buildError({
          status: 502,
          detail: `${upstream} text response empty`,
          message: `${upstream} text response empty`,
          provider: resolvedProvider || provider,
          model: candidateModel,
          upstream
        });
      }

      return {
        text,
        model: candidateModel,
        provider: resolvedProvider || candidateProvider,
        toolCalls,
        raw: body
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const shouldTryNextModel = candidateRoute !== candidateRoutes.at(-1)
        && (status === 400 || status === 404 || status === 408 || status === 429 || status >= 500);
      if (shouldTryNextModel) continue;
      throw error;
    }
  }

  throw lastError || buildError({
    status: 502,
    detail: `${upstream} text response failed across all models`,
    message: `${upstream} text response failed across all models`,
    provider,
    model,
    upstream
  });
};

const readStreamingCompletion = async ({ response, onDelta, signal }) => {
  if (!response?.body?.getReader) {
    const rawText = await readTextSafely(response);
    const body = parseJsonSafely(rawText) || rawText;
    const text = extractChatContent(body);
    if (text && typeof onDelta === 'function') onDelta(text);
    return { text, raw: body };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finalRaw = null;

  const consumeBlock = (block = '') => {
    const dataLines = String(block || '')
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart());
    dataLines.forEach((line) => {
      if (!line || line === '[DONE]') return;
      const payload = parseJsonSafely(line);
      if (!payload) return;
      finalRaw = payload;
      const delta = extractDeltaContent(payload);
      if (!delta) return;
      text += delta;
      if (typeof onDelta === 'function') onDelta(delta);
    });
  };

  while (true) {
    if (signal?.aborted) {
      try { await reader.cancel(); } catch (_error) {}
      throw buildError({
        status: 499,
        detail: 'AI request aborted',
        message: 'AI request aborted'
      });
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    blocks.forEach(consumeBlock);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeBlock(buffer);
  return { text: stripThinkBlocks(text), raw: finalRaw };
};

const chatCompleteStream = async ({
  messages = [],
  temperature = 0.35,
  maxTokens = 260,
  reasoningEffort = 'medium',
  fallbackModels = [],
  preferFallbackModels = false,
  route = '',
  modelRoutes = [],
  responseFormat = null,
  tools = null,
  toolChoice = null,
  onDelta = null,
  signal = null
} = {}) => {
  const {
    token,
    model,
    textModelFallbacks,
    provider,
    timeoutMs,
    routerBaseUrl,
    routeProfiles,
    upstream,
    referer,
    appTitle
  } = getConfig();
  if (!token) {
    const tokenName = upstream === 'openrouter' ? 'OPENROUTER_API_KEY' : 'HF_TOKEN';
    throw buildError({
      status: 401,
      detail: `${tokenName} not configured`,
      message: `${tokenName} not configured`,
      provider,
      model,
      upstream
    });
  }
  if (!model) {
    const modelName = upstream === 'openrouter' ? 'OPENROUTER_TEXT_MODEL' : 'HF_TEXT_MODEL';
    throw buildError({
      status: 500,
      detail: `${modelName} not configured`,
      message: `${modelName} not configured`,
      provider,
      model,
      upstream
    });
  }

  const safeMessages = Array.isArray(messages)
    ? messages
        .map((entry) => ({
          role: String(entry?.role || '').trim(),
          content: String(entry?.content || '').trim()
        }))
        .filter((entry) => entry.role && entry.content)
    : [];
  if (safeMessages.length === 0) {
    throw buildError({
      status: 400,
      detail: `${upstream} chat requires at least one message`,
      message: `${upstream} chat requires at least one message`,
      provider,
      model,
      upstream
    });
  }

  const preferredFallbacks = Array.isArray(fallbackModels) ? fallbackModels : [];
  const configuredFallbacks = Array.isArray(textModelFallbacks) ? textModelFallbacks : [];
  const explicitRoutes = Array.isArray(modelRoutes) ? modelRoutes : [];
  const profileRoutes = route && Array.isArray(routeProfiles?.[route]) ? routeProfiles[route] : [];
  const legacyRoutes = [
    parseRouteEntry({ model, provider }),
    ...configuredFallbacks.map((entry) => parseRouteEntry(entry, provider))
  ].filter(Boolean);
  const candidateRoutes = explicitRoutes.length > 0
    ? mergeCandidateRoutes(explicitRoutes, preferredFallbacks)
    : profileRoutes.length > 0
      ? mergeCandidateRoutes(preferFallbackModels ? preferredFallbacks : [], profileRoutes, preferFallbackModels ? [] : preferredFallbacks)
      : preferFallbackModels
        ? mergeCandidateRoutes(preferredFallbacks, legacyRoutes)
        : mergeCandidateRoutes(legacyRoutes, preferredFallbacks);
  let lastError = null;

  for (const candidateRoute of candidateRoutes) {
    const candidateModel = candidateRoute.model;
    const candidateProvider = candidateRoute.provider || provider;
    try {
      const { response, provider: resolvedProvider } = await requestChatCompletionsStream({
        token,
        model: candidateModel,
        provider: candidateProvider,
        timeoutMs,
        routerBaseUrl,
        upstream,
        referer,
        appTitle,
        payload: {
          messages: safeMessages,
          temperature,
          max_tokens: maxTokens,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
          ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {})
        },
        signal
      });
      const streamed = await readStreamingCompletion({ response, onDelta, signal });
      if (!streamed.text) {
        throw buildError({
          status: 502,
          detail: `${upstream} streaming response empty`,
          message: `${upstream} streaming response empty`,
          provider: resolvedProvider || provider,
          model: candidateModel,
          upstream
        });
      }
      return {
        text: streamed.text,
        model: candidateModel,
        provider: resolvedProvider || candidateProvider,
        raw: streamed.raw
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const shouldTryNextModel = candidateRoute !== candidateRoutes.at(-1)
        && !signal?.aborted
        && (status === 400 || status === 404 || status === 408 || status === 429 || status >= 500);
      if (shouldTryNextModel) continue;
      throw error;
    }
  }

  throw lastError || buildError({
    status: 502,
    detail: `${upstream} streaming response failed across all models`,
    message: `${upstream} streaming response failed across all models`,
    provider,
    model,
    upstream
  });
};

module.exports = {
  chatComplete,
  chatCompleteStream,
  getConfig,
  isTextGenerationConfigured,
  __testables: {
    parseRouteEntry,
    parseRouteList,
    mergeCandidateRoutes,
    getConfiguredRouteProfiles,
    extractDeltaContent
  }
};
