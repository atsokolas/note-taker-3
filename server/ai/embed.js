/* Embeddings come from OpenRouter, the same account that runs the chat model.
   The default is the model the AI service used to run through Hugging Face,
   so the 384-dimension vectors already stored in Atlas, and every similarity
   threshold tuned against them, stay valid. That route went dark when the
   Hugging Face balance ran out, and a sleeping Render service in front of it
   added a forty-second wake-up to the first search after any quiet period. */
const DEFAULT_EMBEDDING_MODEL = 'sentence-transformers/all-minilm-l6-v2';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const MAX_EMBED_TEXT_CHARS = 4000;

const truncateText = (text, maxChars = MAX_EMBED_TEXT_CHARS) => {
  const value = String(text || '');
  return value.length > maxChars ? value.slice(0, maxChars) : value;
};

class EmbeddingError extends Error {
  constructor(message, status = 503, payload = null) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

const getConfig = () => ({
  token: String(process.env.OPENROUTER_API_KEY || '').trim(),
  model: String(process.env.OPENROUTER_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL).trim(),
  baseUrl: String(process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
  timeoutMs: Number(process.env.OPENROUTER_EMBEDDING_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
});

const isEmbeddingConfigured = () => Boolean(getConfig().token);

/* A rate limit (429), an overloaded provider (529) and an empty balance (402)
   all mean "not now": refuse
   at once and stop asking for a while. The job runner sees a 429 and holds
   its jobs instead of abandoning them, so they embed once the provider says
   yes again. */
let rateLimitedUntil = 0;

const NOT_NOW = new Set([402, 429, 529]);

const embedTexts = async (texts = [], { rateLimitCooldownMs = DEFAULT_RATE_LIMIT_COOLDOWN_MS } = {}) => {
  const inputs = (Array.isArray(texts) ? texts : []).map(text => truncateText(String(text || '').trim()));
  if (!inputs.length || inputs.some(text => !text)) {
    throw new EmbeddingError('Embedding requires non-empty text.', 400);
  }
  const { token, model, baseUrl, timeoutMs } = getConfig();
  if (!token) throw new EmbeddingError('No embedding provider is configured.', 503);
  const now = Date.now();
  if (now < rateLimitedUntil) {
    const message = 'Embedding provider is cooling down after a rate limit.';
    throw new EmbeddingError(message, 429, { error: message, retryAfterMs: rateLimitedUntil - now });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let body = null;
  try {
    response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: inputs }),
      signal: controller.signal
    });
    body = await response.json().catch(() => null);
  } catch (error) {
    throw new EmbeddingError(
      error?.name === 'AbortError'
        ? `Embedding request timed out after ${timeoutMs}ms.`
        : `Embedding request failed: ${error?.message || error}`,
      503
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const notNow = NOT_NOW.has(response.status);
    if (notNow) {
      rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + Math.max(1000, Number(rateLimitCooldownMs) || 0));
    }
    const message = `Embedding provider error ${response.status}: ${body?.error?.message || response.statusText}`;
    throw new EmbeddingError(message, notNow ? 429 : response.status, {
      error: message,
      upstream: 'openrouter',
      ...(response.status === 402 ? { reason: 'out_of_credit' } : {})
    });
  }

  const rows = Array.isArray(body?.data) ? [...body.data] : [];
  rows.sort((a, b) => Number(a?.index || 0) - Number(b?.index || 0));
  const vectors = rows.map(row => row?.embedding);
  if (vectors.length !== inputs.length || !vectors.every(Array.isArray)) {
    throw new EmbeddingError('Embedding response missing vectors.', 502);
  }
  return vectors;
};

const embedText = async (text, options = {}) => {
  const [vector] = await embedTexts([text], options);
  return vector;
};

module.exports = {
  embedText,
  embedTexts,
  isEmbeddingConfigured,
  EmbeddingError,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_RATE_LIMIT_COOLDOWN_MS
};
