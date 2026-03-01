const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 1;

const normalizeBaseUrl = (value = '') => {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/synthesize')) {
    return trimmed.slice(0, -'/synthesize'.length);
  }
  if (trimmed.endsWith('/embed')) {
    return trimmed.slice(0, -'/embed'.length);
  }
  return trimmed;
};

const getConfig = () => ({
  baseUrl: normalizeBaseUrl(process.env.AI_SERVICE_URL || ''),
  secret: (process.env.AI_SHARED_SECRET || '').trim(),
  timeoutMs: Number(process.env.AI_SERVICE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  retries: Number(process.env.AI_SERVICE_RETRIES || DEFAULT_RETRIES)
});

const buildError = ({ status, message, hint }) => {
  const error = new Error(message);
  error.status = status;
  error.payload = {
    error: status === 503 ? 'AI_DISABLED' : 'UPSTREAM_FAILED',
    upstream: 'ai_service',
    message,
    hint
  };
  return error;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const stripHtml = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const isLikelyHtml = (value = '') => /<html|<!doctype html|<\/html>/i.test(String(value || ''));
const safeSnippet = (value = '') => {
  const text = String(value || '');
  if (!text) return '';
  if (isLikelyHtml(text)) return 'Upstream returned an HTML rate-limit/challenge page.';
  if (/<[a-z][\s\S]*>/i.test(text)) return stripHtml(text).slice(0, 500);
  return text.slice(0, 500);
};
const parseMaybeJson = (text = '') => {
  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
};

const request = async ({
  path,
  method = 'POST',
  body,
  requestId
}) => {
  const { baseUrl, secret, timeoutMs, retries } = getConfig();
  const safeBaseUrl = baseUrl;
  const safePath = path.startsWith('/') ? path : `/${path}`;
  if (!safeBaseUrl) {
    throw buildError({
      status: 503,
      message: 'AI service URL not configured.',
      hint: 'Set AI_SERVICE_URL (or disable upstream mode).'
    });
  }
  if (!secret) {
    throw buildError({
      status: 503,
      message: 'AI shared secret not configured.',
      hint: 'Set AI_SHARED_SECRET to match the ai_service.'
    });
  }
  const url = `${safeBaseUrl}${safePath}`;
  const traceId = requestId || crypto.randomUUID().slice(0, 8);

  console.log('[AI-UPSTREAM] request', {
    requestId: traceId,
    baseUrl: safeBaseUrl,
    path: safePath,
    url,
    timeoutMs
  });

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'x-ai-shared-secret': secret,
          'Content-Type': 'application/json',
          'X-Request-Id': traceId
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const parsed = parseMaybeJson(text);
        const snippet = safeSnippet(text);
        const detail = typeof parsed?.detail === 'string'
          ? parsed.detail
          : (typeof parsed?.message === 'string' ? parsed.message : '');
        const message = `AI service error ${res.status}: ${detail || snippet || res.statusText}`;
        console.error('[AI-UPSTREAM] response error', {
          requestId: traceId,
          status: res.status,
          path: safePath,
          url,
          message,
          bodySnippet: snippet
        });
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await sleep(200 * Math.pow(2, attempt));
          attempt += 1;
          continue;
        }
        if (parsed && typeof parsed === 'object') {
          const error = new Error(message);
          error.status = res.status;
          error.payload = {
            upstream: 'ai_service',
            ...parsed
          };
          throw error;
        }
        throw buildError({
          status: 502,
          message,
          hint: 'Check AI_SERVICE_URL, cold start, or Render service status.'
        });
      }
      return res.json();
    } catch (error) {
      clearTimeout(timeout);
      if (error && error.payload && error.status) {
        throw error;
      }
      const isTimeout = error.name === 'AbortError';
      const message = isTimeout
        ? `AI service request timed out after ${timeoutMs}ms`
        : `AI service fetch failed: ${error.message}`;
      console.error('[AI-UPSTREAM] request failed', {
        requestId: traceId,
        path: safePath,
        message
      });
      if (attempt < retries) {
        await sleep(200 * Math.pow(2, attempt));
        attempt += 1;
        continue;
      }
      throw buildError({
        status: 502,
        message,
        hint: 'Check AI_SERVICE_URL, cold start, or Render service status.'
      });
    }
  }
};

const health = async ({ requestId } = {}) => request({
  path: '/health',
  method: 'GET',
  requestId
});

module.exports = {
  request,
  health,
  getConfig
};
