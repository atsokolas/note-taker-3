const DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_ROUTER_BASE_URL = 'https://router.huggingface.co/hf-inference/models';

const getConfig = () => ({
  token: process.env.HF_TOKEN || '',
  model: process.env.HF_EMBEDDING_MODEL || DEFAULT_MODEL,
  timeoutMs: Number(process.env.HF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  routerBaseUrl: process.env.HF_ROUTER_BASE_URL || DEFAULT_ROUTER_BASE_URL
});

const startupConfig = getConfig();
console.log('[HF] inference client', {
  model: startupConfig.model,
  timeoutMs: startupConfig.timeoutMs,
  routerBaseUrl: startupConfig.routerBaseUrl
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

const buildRouterUrl = ({ routerBaseUrl, model }) => {
  const base = String(routerBaseUrl || DEFAULT_ROUTER_BASE_URL).replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(model)}`;
};

const requestRouterEmbeddings = async ({ token, model, timeoutMs, routerBaseUrl, inputs, options = {} }) => {
  const url = buildRouterUrl({ routerBaseUrl, model });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    inputs: inputs.length === 1 ? String(inputs[0] || '') : inputs,
    options: {
      wait_for_model: true
    },
    ...options
  };
  if (options && typeof options === 'object' && options.options && typeof options.options === 'object') {
    payload.options = {
      wait_for_model: true,
      ...options.options
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const rawText = await readTextSafely(response);
    const json = parseJsonSafely(rawText);

    if (!response.ok) {
      const message = typeof json?.error === 'string'
        ? json.error
        : rawText || `HF request failed with status ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.response = {
        status: response.status,
        data: message,
        body: rawText
      };
      throw err;
    }

    return json ?? rawText;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`HF request timed out after ${timeoutMs}ms`);
      timeoutError.status = 504;
      timeoutError.code = 'ETIMEDOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const embedTexts = async (texts = [], options = {}) => {
  const { token, model, timeoutMs, routerBaseUrl } = getConfig();
  if (!token) {
    const err = new Error('HF token missing/invalid');
    err.status = 401;
    throw err;
  }

  const inputs = Array.isArray(texts) ? texts : [];
  const result = await requestRouterEmbeddings({
    token,
    model,
    timeoutMs,
    routerBaseUrl,
    inputs,
    options
  });

  return normalizeEmbeddings(result, inputs.length);
};

module.exports = {
  embedTexts,
  normalizeEmbeddings
};
