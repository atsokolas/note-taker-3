const { embedTexts: embedWithClient } = require('./hfClient');

const DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const DEFAULT_BATCH_SIZE = 32;
const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_TIMEOUT_MS = 30000;
const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;

const queryCache = new Map();

const getConfig = () => ({
  token: process.env.HF_TOKEN || '',
  model: process.env.HF_EMBEDDING_MODEL || DEFAULT_MODEL,
  timeoutMs: Number(process.env.HF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
});

const startupConfig = getConfig();
console.log('[HF] embeddings config', {
  model: startupConfig.model,
  timeoutMs: startupConfig.timeoutMs
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const truncateText = (text, maxChars = DEFAULT_MAX_CHARS) => {
  const value = String(text || '');
  return value.length > maxChars ? value.slice(0, maxChars) : value;
};

const buildHint = (status, message = '') => {
  if (status === 401 || status === 403) return 'Check HF_TOKEN.';
  if (status === 503) return 'HF inference temporarily unavailable.';
  if (status === 504) return 'Request timed out.';
  if (message.includes('ENOTFOUND') || message.includes('fetch failed')) {
    return 'Outbound network or DNS is blocked.';
  }
  return 'Check HF credentials and network access.';
};

const buildClientError = ({ message, status, cause, hint, meta }) => {
  const error = new Error(message);
  error.status = status;
  error.cause = cause;
  error.payload = {
    error: status === 504 ? 'HF timeout' : 'HF request failed',
    message,
    cause: String(cause || ''),
    hint,
    model: meta?.model || '',
    status,
    url: meta?.url || ''
  };
  error.meta = meta;
  return error;
};

const extractBodySnippet = (error) => {
  const raw =
    error?.response?.data ||
    error?.response?.body ||
    error?.body ||
    error?.cause ||
    '';
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 200);
  try {
    return JSON.stringify(raw).slice(0, 200);
  } catch (err) {
    return String(raw).slice(0, 200);
  }
};

const requestEmbeddings = async ({ token, model, texts }) => {
  const { timeoutMs } = getConfig();
  const meta = { model, timeoutMs };
  if (!token) {
    throw buildClientError({
      message: 'HF token missing/invalid',
      status: 401,
      cause: '',
      hint: buildHint(401),
      meta
    });
  }
  try {
    return await embedWithClient(texts);
  } catch (error) {
    const bodySnippet = extractBodySnippet(error);
    const status = error.status || error.response?.status || 502;
    const isTimeout = status === 504 || error.code === 'ETIMEDOUT';
    const message = isTimeout
      ? `HF request timed out after ${timeoutMs}ms | model=${model}`
      : `HF embeddings failed (${status}): ${bodySnippet || error.message || 'Unknown error'} | model=${model}`;
    const err = buildClientError({
      message,
      status: isTimeout ? 504 : status,
      cause: error,
      hint: buildHint(status, bodySnippet || error.message || ''),
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
        const status = err.status || err.response?.status || 502;
        const shouldRetry = status === 429 || status >= 500;
        if (shouldRetry && attempt < retries) {
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
