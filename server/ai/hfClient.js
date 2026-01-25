const { InferenceClient } = require('@huggingface/inference');

const DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const DEFAULT_TIMEOUT_MS = 30000;

const getConfig = () => ({
  token: process.env.HF_TOKEN || '',
  model: process.env.HF_EMBEDDING_MODEL || DEFAULT_MODEL,
  timeoutMs: Number(process.env.HF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
});

const startupConfig = getConfig();
console.log('[HF] inference client', {
  model: startupConfig.model,
  timeoutMs: startupConfig.timeoutMs
});

const withTimeout = (promise, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`HF request timed out after ${timeoutMs}ms`);
      err.status = 504;
      err.code = 'ETIMEDOUT';
      reject(err);
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value)) return Array.from(value);
  return [];
};

const normalizeEmbeddings = (result, inputCount) => {
  if (ArrayBuffer.isView(result)) {
    if (inputCount === 1) return [Array.from(result)];
    throw new Error('HF embeddings response invalid.');
  }
  if (!Array.isArray(result)) {
    throw new Error('HF embeddings response invalid.');
  }
  if (result.length === 0) return [];

  const first = result[0];
  if (Array.isArray(first) || ArrayBuffer.isView(first)) {
    return result.map(embed => toArray(embed));
  }
  if (typeof first === 'number' && inputCount === 1) {
    return [result.map(value => Number(value))];
  }
  throw new Error('HF embeddings response invalid.');
};

const embedTexts = async (texts = [], options = {}) => {
  const { token, model, timeoutMs } = getConfig();
  if (!token) {
    const err = new Error('HF token missing/invalid');
    err.status = 401;
    throw err;
  }
  const inputs = Array.isArray(texts) ? texts : [];
  const client = new InferenceClient(token);
  const request = client.featureExtraction({
    model,
    inputs,
    ...options
  });
  const result = await withTimeout(request, timeoutMs);
  return normalizeEmbeddings(result, inputs.length);
};

module.exports = {
  embedTexts,
  normalizeEmbeddings
};
