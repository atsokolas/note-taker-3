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

const embedText = async (text) => {
  const trimmed = truncateText(String(text || '').trim());
  if (!trimmed) {
    throw new EmbeddingError('Embedding requires non-empty text.', 400);
  }
  try {
    const response = await embedViaAiService([trimmed], { requestId: 'server-embed-text' });
    const vectors = Array.isArray(response?.vectors) ? response.vectors : [];
    const [embedding] = vectors;
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
