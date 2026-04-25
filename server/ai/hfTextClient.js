const DEFAULT_TEXT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_PROVIDER = 'groq';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_TEXT_MODEL_FALLBACKS = [
  'openai/gpt-oss-120b:cerebras',
  'openai/gpt-oss-120b:fireworks-ai',
  'Qwen/Qwen3-Next-80B-A3B-Instruct:novita'
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

const getConfiguredRouteProfiles = (provider = DEFAULT_PROVIDER) => {
  const jsonProfiles = parseJsonRouteProfiles(process.env.HF_AGENT_MODEL_ROUTES_JSON || '', provider);
  return Object.keys(DEFAULT_ROUTE_PROFILES).reduce((acc, profile) => {
    const envKey = ROUTE_ENV_KEYS[profile];
    const envRoutes = envKey ? parseRouteList(process.env[envKey] || '', provider) : [];
    const jsonRoutes = Array.isArray(jsonProfiles[profile]) ? jsonProfiles[profile] : [];
    const defaultRoutes = (DEFAULT_ROUTE_PROFILES[profile] || [])
      .map((entry) => parseRouteEntry(entry, provider))
      .filter(Boolean);
    acc[profile] = mergeCandidateRoutes(envRoutes, jsonRoutes, defaultRoutes);
    return acc;
  }, {});
};

const getConfig = () => ({
  token: process.env.HF_TOKEN || '',
  model: process.env.HF_TEXT_MODEL || DEFAULT_TEXT_MODEL,
  textModelFallbacks: parseModelFallbacks(
    process.env.HF_TEXT_MODEL_FALLBACKS || DEFAULT_TEXT_MODEL_FALLBACKS.join(','),
    process.env.HF_TEXT_MODEL || DEFAULT_TEXT_MODEL
  ),
  provider: process.env.HF_PROVIDER || DEFAULT_PROVIDER,
  timeoutMs: Number(process.env.HF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  routerBaseUrl: process.env.HF_ROUTER_BASE_URL || DEFAULT_ROUTER_BASE_URL,
  routeProfiles: getConfiguredRouteProfiles(process.env.HF_PROVIDER || DEFAULT_PROVIDER)
});

const startupConfig = getConfig();
console.log('[HF] text client', {
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

const buildError = ({ status, message, detail = '', provider = '', model = '' }) => {
  const error = new Error(message);
  error.status = status;
  error.payload = {
    error: status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_FAILED',
    detail,
    message,
    provider,
    model,
    upstream: 'huggingface'
  };
  return error;
};

const requestChatCompletions = async ({
  token,
  model,
  provider,
  timeoutMs,
  routerBaseUrl,
  payload
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
      const requestPayload = {
        ...basePayload,
        ...(attempt.withProvider ? { provider } : {})
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
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
          model
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
          status: 504,
          detail: 'HF request timed out',
          message: `HF request timed out after ${timeoutMs}ms`,
          provider,
          model
        });
      }
      if (error?.payload || error?.status) throw error;
      throw buildError({
        status: 502,
        detail: String(error?.message || 'HF request failed'),
        message: `HF request failed: ${error?.message || 'Unknown error'}`,
        provider,
        model
      });
    } finally {
      clearTimeout(timer);
    }
  }

  throw buildError({
    status: 502,
    detail: 'HF request failed',
    message: 'HF request failed without a usable response.',
    provider,
    model
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
  const { token, model, textModelFallbacks, provider, timeoutMs, routerBaseUrl, routeProfiles } = getConfig();
  if (!token) {
    throw buildError({
      status: 401,
      detail: 'HF_TOKEN not configured',
      message: 'HF_TOKEN not configured',
      provider,
      model
    });
  }
  if (!model) {
    throw buildError({
      status: 500,
      detail: 'HF_TEXT_MODEL not configured',
      message: 'HF_TEXT_MODEL not configured',
      provider,
      model
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
      detail: 'HF chat requires at least one message',
      message: 'HF chat requires at least one message',
      provider,
      model
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
          detail: 'HF text response empty',
          message: 'HF text response empty',
          provider: resolvedProvider || provider,
          model: candidateModel
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
    detail: 'HF text response failed across all models',
    message: 'HF text response failed across all models',
    provider,
    model
  });
};

module.exports = {
  chatComplete,
  getConfig,
  isTextGenerationConfigured,
  __testables: {
    parseRouteEntry,
    parseRouteList,
    mergeCandidateRoutes,
    getConfiguredRouteProfiles
  }
};
