const { embedTexts, truncateText } = require('./hfEmbeddingsClient');

class EmbeddingError extends Error {
  constructor(message, status = 503, payload = null) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

const embedText = async (text) => {
  const trimmed = truncateText(String(text || '').trim());
  if (!trimmed) {
    throw new EmbeddingError('Embedding requires non-empty text.', 400);
  }
  try {
    const [embedding] = await embedTexts([trimmed], { batchSize: 1 });
    if (!Array.isArray(embedding)) {
      throw new EmbeddingError('Embedding response missing vector.');
    }
    return embedding;
  } catch (error) {
    const status = error.status || 503;
    const payload = error.payload || null;
    throw new EmbeddingError(error.message || 'Embedding service unavailable.', status, payload);
  }
};

module.exports = {
  embedText,
  EmbeddingError
};
