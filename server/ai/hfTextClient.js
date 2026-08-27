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
const OPENROUTER_FREE_FALLBACK_MODELS = ['openrouter/free'];
const OPENROUTER_NO_REASONING_ARTIFACT_ROUTES = Object.freeze([
  { model: 'nvidia/nemotron-3-super-120b-a12b:free', provider: '' },
  { model: 'google/gemma-4-31b-it:free', provider: '' },
  { model: 'google/gemma-4-26b-a4b-it:free', provider: '' },
  { model: 'nvidia/nemotron-nano-9b-v2:free', provider: '' }
]);

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

const DEFAULT_ROUTE_CONTRACTS = Object.freeze({
  partner_chat: Object.freeze({
    temperature: 0.25,
    maxTokens: 360,
    reasoningEffort: 'low',
    parserStrategy: 'plain_text',
    responseFormat: null
  }),
  critique: Object.freeze({
    temperature: 0.2,
    maxTokens: 700,
    reasoningEffort: 'medium',
    parserStrategy: 'plain_text',
    responseFormat: null
  }),
  artifact_draft: Object.freeze({
    temperature: 0.2,
    maxTokens: 1400,
    reasoningEffort: 'medium',
    parserStrategy: 'plain_text',
    responseFormat: null
  }),
  tool_router: Object.freeze({
    temperature: 0,
    maxTokens: 300,
    reasoningEffort: 'low',
    parserStrategy: 'tool_call',
    responseFormat: null
  }),
  structure_planner: Object.freeze({
    temperature: 0.1,
    maxTokens: 1200,
    reasoningEffort: 'medium',
    parserStrategy: 'json',
    responseFormat: Object.freeze({ type: 'json_object' })
  }),
  hygiene_scan: Object.freeze({
    temperature: 0.15,
    maxTokens: 1400,
    reasoningEffort: 'medium',
    parserStrategy: 'json',
    responseFormat: Object.freeze({ type: 'json_object' })
  }),
  deep_audit: Object.freeze({
    temperature: 0.2,
    maxTokens: 1800,
    reasoningEffort: 'high',
    parserStrategy: 'plain_text',
    responseFormat: null
  })
});

const DEFAULT_GENERATION_CONTRACT = Object.freeze({
  temperature: 0.35,
  maxTokens: 260,
  reasoningEffort: 'medium',
  parserStrategy: 'plain_text',
  responseFormat: null
});

const getRouteContract = (route = '') => ({
  ...DEFAULT_GENERATION_CONTRACT,
  ...(DEFAULT_ROUTE_CONTRACTS[String(route || '').trim()] || {})
});

const resolveParserStrategy = ({ profile = {}, responseFormat, hasExplicitResponseFormat = false, tools = [] } = {}) => {
  if (responseFormat?.type && /json/i.test(responseFormat.type)) return 'json';
  if (Array.isArray(tools) && tools.length > 0 && profile.parserStrategy === 'tool_call') return 'tool_call';
  if (hasExplicitResponseFormat && !responseFormat) return 'plain_text';
  return profile.parserStrategy === 'tool_call' ? 'plain_text' : profile.parserStrategy;
};

const resolveGenerationContract = ({
  route = '',
  temperature,
  maxTokens,
  reasoningEffort,
  responseFormat,
  tools = []
} = {}) => {
  const profile = getRouteContract(route);
  const hasExplicitResponseFormat = responseFormat !== undefined;
  const resolvedResponseFormat = hasExplicitResponseFormat ? responseFormat : profile.responseFormat;
  return {
    route: String(route || '').trim(),
    temperature: temperature === undefined ? profile.temperature : temperature,
    maxTokens: maxTokens === undefined ? profile.maxTokens : maxTokens,
    reasoningEffort: reasoningEffort === undefined ? profile.reasoningEffort : reasoningEffort,
    responseFormat: resolvedResponseFormat,
    parserStrategy: resolveParserStrategy({
      profile,
      responseFormat: resolvedResponseFormat,
      hasExplicitResponseFormat,
      tools
    })
  };
};

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

const isFallbackModelStatus = (status = 0) => {
  const numericStatus = Number(status || 0);
  return [400, 402, 404, 408, 429].includes(numericStatus) || numericStatus >= 500;
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

const resolvePreferredUpstream = () => {
  const requested = String(process.env.AI_TEXT_UPSTREAM || '').trim().toLowerCase();
  if (requested === 'openrouter' || requested === 'huggingface') return requested;
  return String(process.env.OPENROUTER_API_KEY || '').trim() ? 'openrouter' : 'huggingface';
};

const getConfig = ({ upstream: upstreamOverride = '' } = {}) => {
  const openRouterToken = process.env.OPENROUTER_API_KEY || '';
  const upstream = upstreamOverride || resolvePreferredUpstream();
  const useOpenRouter = upstream === 'openrouter';
  const model = useOpenRouter
    ? (process.env.OPENROUTER_TEXT_MODEL || DEFAULT_OPENROUTER_TEXT_MODEL)
    : (process.env.HF_TEXT_MODEL || DEFAULT_TEXT_MODEL);
  const configuredOpenRouterFallbacks = parseModelFallbacks(
    process.env.OPENROUTER_TEXT_MODEL_FALLBACKS || DEFAULT_OPENROUTER_TEXT_MODEL_FALLBACKS.join(','),
    model
  );
  const textModelFallbacks = useOpenRouter
    ? parseModelFallbacks(
      [...configuredOpenRouterFallbacks, ...OPENROUTER_FREE_FALLBACK_MODELS].join(','),
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
    noReasoningArtifactRoutes: useOpenRouter
      ? OPENROUTER_NO_REASONING_ARTIFACT_ROUTES.map(route => ({ ...route }))
      : [],
    routeProfiles: getConfiguredRouteProfiles(provider, { upstream, primaryModel: model, fallbacks: textModelFallbacks })
  };
};

const getConfigChain = ({ allowFallback = true } = {}) => {
  const preferred = getConfig();
  if (!allowFallback) return [preferred];
  const alternateUpstream = preferred.upstream === 'openrouter' ? 'huggingface' : 'openrouter';
  const alternate = getConfig({ upstream: alternateUpstream });
  return String(alternate.token || '').trim() ? [preferred, alternate] : [preferred];
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

const requestPayloadFor = ({
  payload = {},
  upstream = 'huggingface',
  provider = '',
  withProvider = false,
  dropReasoning = false
} = {}) => {
  const nextPayload = { ...payload };
  if (upstream !== 'huggingface') {
    delete nextPayload.reasoning_effort;
  }
  if (dropReasoning) {
    delete nextPayload.reasoning;
  }
  if (withProvider && provider && upstream === 'huggingface') {
    nextPayload.provider = provider;
  }
  return nextPayload;
};

// `provider` and `reasoning` are routing and latency hints, not content. Some
// upstreams reject one outright, and a rejected hint used to fail the whole
// generation — which an ordinary Wiki build absorbs as deterministic fallback
// prose that still looks like a finished article. Plan an attempt per hint we
// are willing to drop so a rejection costs one retry, not the page.
const planRequestAttempts = ({ provider = '', payload = {} } = {}) => {
  const canDropReasoning = Object.prototype.hasOwnProperty.call(payload, 'reasoning');
  const attempts = [];
  [Boolean(provider), false].forEach((withProvider, providerIndex) => {
    if (providerIndex === 1 && !provider) return;
    [false, true].forEach((dropReasoning) => {
      if (dropReasoning && !canDropReasoning) return;
      attempts.push({ withProvider, dropReasoning });
    });
  });
  return attempts;
};

const UNSUPPORTED_FIELD_PATTERN = /unknown field|extra inputs|not permitted|unsupported|wrong_api_format/;

const rejectsField = ({ status = 0, detail = '', field = '' } = {}) => {
  if (!(status >= 400 && status < 500)) return false;
  const lower = String(detail || '').toLowerCase();
  return lower.includes(field) && UNSUPPORTED_FIELD_PATTERN.test(lower);
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
  const attempts = planRequestAttempts({ provider, payload: basePayload });
  let skipProviderField = false;
  let skipReasoningField = false;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (attempt.withProvider && skipProviderField) continue;
    if (!attempt.dropReasoning && skipReasoningField) continue;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestPayload = requestPayloadFor({
        payload: basePayload,
        upstream,
        provider,
        withProvider: attempt.withProvider,
        dropReasoning: attempt.dropReasoning
      });
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
        if (attempt.withProvider && rejectsField({ status: response.status, detail, field: 'provider' })) {
          skipProviderField = true;
          continue;
        }
        if (!attempt.dropReasoning && rejectsField({ status: response.status, detail, field: 'reasoning' })) {
          skipReasoningField = true;
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
  const attempts = planRequestAttempts({ provider, payload: basePayload });
  let skipProviderField = false;
  let skipReasoningField = false;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (attempt.withProvider && skipProviderField) continue;
    if (!attempt.dropReasoning && skipReasoningField) continue;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestPayload = requestPayloadFor({
        payload: basePayload,
        upstream,
        provider,
        withProvider: attempt.withProvider,
        dropReasoning: attempt.dropReasoning
      });
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
        if (attempt.withProvider && rejectsField({ status: response.status, detail, field: 'provider' })) {
          skipProviderField = true;
          continue;
        }
        if (!attempt.dropReasoning && rejectsField({ status: response.status, detail, field: 'reasoning' })) {
          skipReasoningField = true;
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

const parseStructuredText = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return null;
  const direct = parseJsonSafely(text);
  if (direct) return direct;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? parseJsonSafely(fenced[1].trim()) : null;
};

const hasReasoningLeak = (value = '') => (
  /^(?:analysis|reasoning|chain of thought|thought process)\s*:/i.test(String(value || '').trim())
  || /^let(?:'s| us) (?:reason|analy[sz]e|think through)\b/i.test(String(value || '').trim())
);

const validateJsonSchemaValue = (value, schema = {}, path = '$') => {
  if (!schema || typeof schema !== 'object') return '';
  const expectedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const matchesType = (type) => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === type;
  };
  if (expectedTypes.length > 0 && !expectedTypes.some(matchesType)) {
    return `${path} must be ${expectedTypes.join(' or ')}.`;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `${path} is not an allowed value.`;
  }
  if (typeof value === 'string') {
    if (Number.isFinite(schema.minLength) && value.length < schema.minLength) return `${path} is too short.`;
    if (Number.isFinite(schema.maxLength) && value.length > schema.maxLength) return `${path} is too long.`;
  }
  if (Array.isArray(value)) {
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) return `${path} has too few items.`;
    if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) return `${path} has too many items.`;
    for (let index = 0; index < value.length; index += 1) {
      const itemError = validateJsonSchemaValue(value[index], schema.items, `${path}[${index}]`);
      if (itemError) return itemError;
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return `${path}.${key} is required.`;
    }
    if (schema.additionalProperties === false) {
      const unexpected = Object.keys(value).find((key) => !Object.prototype.hasOwnProperty.call(properties, key));
      if (unexpected) return `${path}.${unexpected} is not allowed.`;
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const propertyError = validateJsonSchemaValue(value[key], childSchema, `${path}.${key}`);
      if (propertyError) return propertyError;
    }
  }
  return '';
};

const schemaFromResponseFormat = (responseFormat) => (
  responseFormat?.type === 'json_schema' ? responseFormat?.json_schema?.schema : null
);

const validateOutputContract = ({
  text = '',
  toolCalls = [],
  parserStrategy = 'plain_text',
  responseFormat = null
} = {}) => {
  if (parserStrategy === 'tool_call') {
    return Array.isArray(toolCalls) && toolCalls.length > 0
      ? { ok: true }
      : { ok: false, message: 'Model did not return the required tool call.' };
  }
  if (parserStrategy === 'json') {
    const parsed = parseStructuredText(text);
    if (!parsed) return { ok: false, message: 'Model did not return valid structured JSON.' };
    const schemaError = validateJsonSchemaValue(parsed, schemaFromResponseFormat(responseFormat));
    return schemaError
      ? { ok: false, message: `Model response failed its structured contract: ${schemaError}` }
      : { ok: true };
  }
  return hasReasoningLeak(text)
    ? { ok: false, message: 'Model exposed internal reasoning instead of a user-facing answer.' }
    : { ok: true };
};

const summarizeUpstreamFailure = ({ upstream = '', error, latencyMs = 0 } = {}) => {
  const status = Number(error?.status || 0);
  let reason = 'request_failed';
  if (status === 402) reason = 'payment_required';
  else if (status === 408) reason = 'timed_out';
  else if (status === 429) reason = 'rate_limited';
  else if (status === 502 && /structured contract|structured JSON/i.test(String(error?.message || ''))) reason = 'invalid_output';
  else if (status >= 500) reason = 'upstream_unavailable';
  return {
    upstream,
    status: 'failed',
    reason,
    httpStatus: status || undefined,
    model: String(error?.model || '').trim() || undefined,
    provider: String(error?.provider || '').trim() || undefined,
    latencyMs
  };
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

const chatCompleteWithConfig = async ({
  messages = [],
  temperature,
  maxTokens,
  reasoningEffort,
  fallbackModels = [],
  preferFallbackModels = false,
  route = '',
  modelRoutes = [],
  responseFormat,
  reasoning = null,
  tools = null,
  toolChoice = null,
  signal = null
} = {}, config = getConfig()) => {
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
  } = config;
  const generationContract = resolveGenerationContract({
    route,
    temperature,
    maxTokens,
    reasoningEffort,
    responseFormat,
    tools
  });
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
          temperature: generationContract.temperature,
          max_tokens: generationContract.maxTokens,
          ...(reasoning && typeof reasoning === 'object'
            ? { reasoning }
            : generationContract.reasoningEffort
              ? { reasoning_effort: generationContract.reasoningEffort }
              : {}),
          ...(generationContract.responseFormat ? { response_format: generationContract.responseFormat } : {}),
          ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {})
        },
        signal
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
      const validation = validateOutputContract({
        text,
        toolCalls,
        parserStrategy: generationContract.parserStrategy,
        responseFormat: generationContract.responseFormat
      });
      if (!validation.ok) {
        throw buildError({
          status: 502,
          detail: validation.message,
          message: validation.message,
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
        raw: body,
        route: generationContract.route,
        outputContract: generationContract.parserStrategy,
        upstream
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const shouldTryNextModel = candidateRoute !== candidateRoutes.at(-1)
        && isFallbackModelStatus(status);
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

const chatComplete = async (input = {}) => {
  const allowUpstreamFallback = !Array.isArray(input.modelRoutes) || input.modelRoutes.length === 0;
  const configs = getConfigChain({ allowFallback: allowUpstreamFallback });
  const attempts = [];
  let lastError = null;

  for (const config of configs) {
    const startedAt = Date.now();
    try {
      const completion = await chatCompleteWithConfig(input, config);
      return {
        ...completion,
        upstreamAttempts: [
          ...attempts,
          {
            upstream: config.upstream,
            status: 'succeeded',
            model: completion.model,
            provider: completion.provider || undefined,
            latencyMs: Date.now() - startedAt
          }
        ]
      };
    } catch (error) {
      lastError = error;
      attempts.push(summarizeUpstreamFailure({
        upstream: config.upstream,
        error,
        latencyMs: Date.now() - startedAt
      }));
      const hasNextUpstream = config !== configs.at(-1);
      if (!hasNextUpstream || !isFallbackModelStatus(error?.status)) {
        error.upstreamAttempts = attempts;
        throw error;
      }
    }
  }

  if (lastError) {
    lastError.upstreamAttempts = attempts;
    throw lastError;
  }
  throw buildError({ status: 502, message: 'No AI text upstream is available.' });
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
  temperature,
  maxTokens,
  reasoningEffort,
  fallbackModels = [],
  preferFallbackModels = false,
  route = '',
  modelRoutes = [],
  responseFormat,
  reasoning = null,
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
  const generationContract = resolveGenerationContract({
    route,
    temperature,
    maxTokens,
    reasoningEffort,
    responseFormat,
    tools
  });
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
          temperature: generationContract.temperature,
          max_tokens: generationContract.maxTokens,
          ...(reasoning && typeof reasoning === 'object'
            ? { reasoning }
            : generationContract.reasoningEffort
              ? { reasoning_effort: generationContract.reasoningEffort }
              : {}),
          ...(generationContract.responseFormat ? { response_format: generationContract.responseFormat } : {}),
          ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {})
        },
        signal
      });
      // Buffer the candidate until its output contract passes. Emitting model
      // deltas first would let malformed JSON or hidden reasoning reach the UI
      // before this fail-closed boundary can reject the response. A validated
      // answer is still delivered through the streaming callback as one safe
      // chunk; callers keep the same transport contract without partial leaks.
      const streamed = await readStreamingCompletion({ response, onDelta: null, signal });
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
      const validation = validateOutputContract({
        text: streamed.text,
        parserStrategy: generationContract.parserStrategy,
        responseFormat: generationContract.responseFormat
      });
      if (!validation.ok) {
        throw buildError({
          status: 502,
          detail: validation.message,
          message: validation.message,
          provider: resolvedProvider || provider,
          model: candidateModel,
          upstream
        });
      }
      if (typeof onDelta === 'function') onDelta(streamed.text);
      return {
        text: streamed.text,
        model: candidateModel,
        provider: resolvedProvider || candidateProvider,
        raw: streamed.raw,
        route: generationContract.route,
        outputContract: generationContract.parserStrategy
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
    getRouteContract,
    resolveParserStrategy,
    resolveGenerationContract,
    validateOutputContract,
    parseRouteEntry,
    parseRouteList,
    isFallbackModelStatus,
    mergeCandidateRoutes,
    getConfiguredRouteProfiles,
    getConfigChain,
    validateJsonSchemaValue,
    summarizeUpstreamFailure,
    extractDeltaContent
  }
};
