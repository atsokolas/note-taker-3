const { embedTexts: embedViaAiService } = require('../config/aiClient');

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

// The embedding service sleeps when idle and answers 502 or 504 for the
// forty-odd seconds it takes to wake. That is a hosting property, not a
// failure: every semantic feature went dark on the first request after any
// quiet period, and the caller could not tell an asleep service from an empty
// library. Wait the wake-up out instead of reporting nothing.
/* 429 is not a cold start. A waking service answers 502/503/504 while it
   boots; 429 is a service that is awake and telling you to stop. Treating it
   as a wake-up meant every rate-limited embed slept 4s, then 12s, then 20s,
   and tried twelve times through the inner client's own retries before giving
   up — thirty-six seconds of a worker holding its text and its errors, per
   job, against a service that was never going to say yes.

   The job runner already knows what to do with a rate limit: release the job
   and stop after three of them. It just never got to see one in time. */
const COLD_START_STATUSES = new Set([502, 503, 504]);
const DEFAULT_EMBED_RETRY_DELAYS_MS = [4000, 12000, 20000];

const isColdStart = (error) => (
  COLD_START_STATUSES.has(Number(error?.status)) || Number(error?.status) === 0 || !error?.status
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const embedText = async (text, { retryDelaysMs = DEFAULT_EMBED_RETRY_DELAYS_MS } = {}) => {
  const trimmed = truncateText(String(text || '').trim());
  if (!trimmed) {
    throw new EmbeddingError('Embedding requires non-empty text.', 400);
  }
  const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : [];
  let lastError = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const response = await embedViaAiService([trimmed], { requestId: 'server-embed-text' });
      const vectors = Array.isArray(response?.vectors) ? response.vectors : [];
      const [embedding] = vectors;
      if (!Array.isArray(embedding)) {
        throw new EmbeddingError('Embedding response missing vector.');
      }
      if (attempt > 0) {
        console.log('[EMBED] recovered after cold start', JSON.stringify({ attempt: attempt + 1 }));
      }
      return embedding;
    } catch (error) {
      lastError = error;
      // A malformed request or a missing route will answer identically forever;
      // only wait out the statuses a waking service actually returns.
      if (!isColdStart(error) || attempt === delays.length) break;
      await sleep(delays[attempt]);
    }
  }
  const status = lastError?.status || 503;
  throw new EmbeddingError(lastError?.message || 'Embedding service unavailable.', status, lastError?.payload || null);
};

module.exports = {
  embedText,
  EmbeddingError,
  DEFAULT_EMBED_RETRY_DELAYS_MS
};
