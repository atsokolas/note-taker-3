const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'nomic-embed-text';

class EmbeddingError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

const getConfig = () => ({
  host: process.env.OLLAMA_HOST || DEFAULT_HOST,
  model: process.env.OLLAMA_EMBED_MODEL || process.env.OLLAMA_MODEL || DEFAULT_MODEL
});

const truncateText = (text, maxChars = 4000) => {
  if (!text) return '';
  return text.length > maxChars ? text.slice(0, maxChars) : text;
};

const embedText = async (text) => {
  const { host, model } = getConfig();
  const trimmed = truncateText(String(text || '').trim());
  if (!trimmed) {
    throw new EmbeddingError('Embedding requires non-empty text.', 400);
  }
  let res;
  try {
    res = await fetch(`${host}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: trimmed })
    });
  } catch (error) {
    throw new EmbeddingError(`Embedding service unavailable: ${error.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EmbeddingError(`Embedding request failed (${res.status}): ${body || res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data?.embedding)) {
    throw new EmbeddingError('Embedding response missing vector.');
  }
  return data.embedding;
};

module.exports = {
  embedText,
  EmbeddingError
};
