const DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const DEFAULT_BATCH_SIZE = 32;
const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_BASE_URL = 'https://api-inference.huggingface.co';
const DEFAULT_TIMEOUT_MS = 20000;
const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;

const queryCache = new Map();

const getConfig = () => ({
  token: process.env.HF_TOKEN || '',
  model: process.env.HF_EMBEDDING_MODEL || DEFAULT_MODEL,
  baseUrl: process.env.HF_BASE_URL || DEFAULT_BASE_URL,
  timeoutMs: Number(process.env.HF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const truncateText = (text, maxChars = DEFAULT_MAX_CHARS) => {
  const value = String(text || '');
  return value.length > maxChars ? value.slice(0, maxChars) : value;
};

const buildUrl = (baseUrl, model) =>
  `${baseUrl.replace(/\/$/, '')}/pipeline/feature-extraction/${encodeURIComponent(model)}`;

const buildHint = (status, message = '') => {
  if (status === 401 || status === 403) return 'Check HF_TOKEN.';
  if (status === 503) return 'HF inference temporarily unavailable.';
  if (status === 504) return 'Request timed out.';
  if (message.includes('ENOTFOUND') || message.includes('fetch failed')) {
    return 'Outbound network or DNS is blocked.';
  }
  return 'Check HF_BASE_URL and network access.';
};

const buildClientError = ({ message, status, cause, hint, meta }) => {
  const error = new Error(message);
  error.status = status;
  error.cause = cause;
  error.payload = {
    error: status === 504 ? 'HF timeout' : 'HF request failed',
    message,
    cause: String(cause || ''),
    hint
  };
  error.meta = meta;
  return error;
};

const requestEmbeddings = async ({ token, model, texts }) => {
  const { baseUrl, timeoutMs } = getConfig();
  const url = buildUrl(baseUrl, model);
  const meta = { url, model, timeoutMs };
  if (!token) {
    throw buildClientError({
      message: 'HF token missing/invalid',
      status: 401,
      cause: '',
      hint: buildHint(401),
      meta
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: texts }),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    const status = error.name === 'AbortError' ? 504 : 502;
    const message = error.name === 'AbortError'
      ? `HF request timed out after ${timeoutMs}ms`
      : 'HF request failed. Check outbound network access and HF_TOKEN.';
    const err = buildClientError({
      message,
      status,
      cause: error,
      hint: buildHint(status, error.message || ''),
      meta
    });
    console.error('[HF] request failed', {
      name: err.name,
      message: err.message,
      cause: String(err.cause || ''),
      stack: err.stack,
      meta
    });
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 401 || res.status === 403) {
    const err = buildClientError({
      message: 'HF token missing/invalid',
      status: res.status,
      cause: '',
      hint: buildHint(res.status),
      meta
    });
    console.error('[HF] request failed', {
      name: err.name,
      message: err.message,
      cause: String(err.cause || ''),
      stack: err.stack,
      meta
    });
    throw err;
  }
  if (res.status === 503) {
    const err = buildClientError({
      message: 'HF inference temporarily unavailable',
      status: 503,
      cause: '',
      hint: buildHint(503),
      meta
    });
    console.error('[HF] request failed', {
      name: err.name,
      message: err.message,
      cause: String(err.cause || ''),
      stack: err.stack,
      meta
    });
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = buildClientError({
      message: `HF embeddings failed (${res.status}): ${body || res.statusText}`,
      status: res.status,
      cause: '',
      hint: buildHint(res.status, body || res.statusText),
      meta
    });
    console.error('[HF] request failed', {
      name: err.name,
      message: err.message,
      cause: String(err.cause || ''),
      stack: err.stack,
      meta
    });
    throw err;
  }
  return res.json();
};

const embedTexts = async (texts, options = {}) => {
  const { token, model } = getConfig();
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const retries = options.retries ?? 2;
  const inputs = (texts || []).map(text => truncateText(text));
  if (inputs.length === 0) return [];

  const output = [];
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    let attempt = 0;
    while (true) {
      try {
        const embeddings = await requestEmbeddings({ token, model, texts: batch });
        if (!Array.isArray(embeddings)) {
          throw new Error('HF embeddings response invalid.');
        }
        embeddings.forEach(embed => output.push(embed));
        break;
      } catch (err) {
        if (err.status === 503 && attempt < retries) {
          const delay = 500 * Math.pow(2, attempt);
          attempt += 1;
          await sleep(delay);
          continue;
        }
        throw err;
      }
    }
  }
  return output;
};

const embedQuery = async (query) => {
  const text = truncateText(String(query || '').trim());
  if (!text) {
    throw new Error('Embedding requires non-empty text.');
  }
  const cached = queryCache.get(text);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.embedding;
  }
  const [embedding] = await embedTexts([text], { batchSize: 1 });
  queryCache.set(text, { embedding, expiresAt: now + QUERY_CACHE_TTL_MS });
  return embedding;
};

module.exports = {
  embedTexts,
  embedQuery,
  truncateText
};
