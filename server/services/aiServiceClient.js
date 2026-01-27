const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 1;

const getConfig = () => ({
  baseUrl: (process.env.AI_SERVICE_URL || '').trim(),
  secret: (process.env.AI_SHARED_SECRET || '').trim(),
  timeoutMs: Number(process.env.AI_SERVICE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  retries: Number(process.env.AI_SERVICE_RETRIES || DEFAULT_RETRIES)
});

const redactUrl = (url) => (url || '').replace(/\/$/, '');

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

const request = async ({
  path,
  method = 'POST',
  body,
  requestId
}) => {
  const { baseUrl, secret, timeoutMs, retries } = getConfig();
  const safeBaseUrl = redactUrl(baseUrl);
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
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
          'X-Request-Id': traceId
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const snippet = String(text || '').slice(0, 300);
        const message = `AI service error ${res.status}: ${snippet || res.statusText}`;
        console.error('[AI-UPSTREAM] response error', {
          requestId: traceId,
          status: res.status,
          path: safePath,
          message
        });
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
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
      return res.json();
    } catch (error) {
      clearTimeout(timeout);
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
