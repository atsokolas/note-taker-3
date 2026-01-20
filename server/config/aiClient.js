const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';
const AI_ENABLED = String(process.env.AI_ENABLED || 'false').toLowerCase() === 'true';

const request = async (path, payload) => {
  const res = await fetch(`${AI_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI service error ${res.status}: ${errorText}`);
  }
  return res.json();
};

const isAiEnabled = () => AI_ENABLED;

const upsertEmbeddings = (items) => request('/embed/upsert', { items });
const deleteEmbeddings = (ids) => request('/embed/delete', { ids });
const getEmbeddings = (ids) => request('/embed/get', { ids });
const semanticSearch = (query) => request('/search', query);
const similarTo = (payload) => request('/similar', payload);

module.exports = {
  AI_SERVICE_URL,
  AI_ENABLED,
  isAiEnabled,
  upsertEmbeddings,
  deleteEmbeddings,
  getEmbeddings,
  semanticSearch,
  similarTo
};
