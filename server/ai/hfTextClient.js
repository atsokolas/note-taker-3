const DEFAULT_TEXT_MODEL = 'Qwen/Qwen2.5-Coder-7B-Instruct';
const DEFAULT_PROVIDER = 'hf-inference';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_TEXT_MODEL_FALLBACKS = [
  'Qwen/Qwen2.5-7B-Instruct-1M',
  'Qwen/Qwen2.5-Coder-7B-Instruct',
  'mistralai/Mistral-7B-Instruct-v0.3'
];

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

const mergeCandidateModels = (...lists) => {
  const seen = new Set();
  const ordered = [];
  lists.flat().forEach((entry) => {
    const model = String(entry || '').trim();
    if (!model || seen.has(model)) return;
    seen.add(model);
    ordered.push(model);
  });
  return ordered;
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
  routerBaseUrl: process.env.HF_ROUTER_BASE_URL || DEFAULT_ROUTER_BASE_URL
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
  const { token, model } = getConfig();
  return Boolean(String(token || '').trim() && String(model || '').trim());
};

const chatComplete = async ({
  messages = [],
  temperature = 0.35,
  maxTokens = 260,
  reasoningEffort = 'medium',
  fallbackModels = [],
  preferFallbackModels = false
} = {}) => {
  const { token, model, textModelFallbacks, provider, timeoutMs, routerBaseUrl } = getConfig();
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
  const candidateModels = preferFallbackModels
    ? mergeCandidateModels(preferredFallbacks, model, configuredFallbacks)
    : mergeCandidateModels(model, preferredFallbacks, configuredFallbacks);
  let lastError = null;

  for (const candidateModel of candidateModels) {
    try {
      const { body, provider: resolvedProvider } = await requestChatCompletions({
        token,
        model: candidateModel,
        provider,
        timeoutMs,
        routerBaseUrl,
        payload: {
          messages: safeMessages,
          temperature,
          max_tokens: maxTokens,
          reasoning_effort: reasoningEffort
        }
      });

      const text = extractChatContent(body);
      if (!text) {
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
        provider: resolvedProvider || provider
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const shouldTryNextModel = candidateModel !== candidateModels.at(-1)
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
  isTextGenerationConfigured
};
