const DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const DEFAULT_BATCH_SIZE = 32;
const DEFAULT_MAX_CHARS = 4000;
const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;

const queryCache = new Map();

const getConfig = () => ({
  token: process.env.HF_TOKEN || '',
  model: process.env.HF_EMBEDDING_MODEL || DEFAULT_MODEL
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const truncateText = (text, maxChars = DEFAULT_MAX_CHARS) => {
  const value = String(text || '');
  return value.length > maxChars ? value.slice(0, maxChars) : value;
};

const buildUrl = (model) =>
  `https://router.huggingface.co/pipeline/feature-extraction/${encodeURIComponent(model)}`;

const requestEmbeddings = async ({ token, model, texts }) => {
  if (!token) {
    const err = new Error('HF token missing/invalid');
    err.status = 401;
    throw err;
  }
  const res = await fetch(buildUrl(model), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ inputs: texts })
  });
  if (res.status === 401 || res.status === 403) {
    const err = new Error('HF token missing/invalid');
    err.status = res.status;
    throw err;
  }
  if (res.status === 503) {
    const err = new Error('HF inference temporarily unavailable');
    err.status = 503;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HF embeddings failed (${res.status}): ${body || res.statusText}`);
    err.status = res.status;
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
