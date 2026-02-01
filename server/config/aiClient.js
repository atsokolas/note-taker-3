const { request, health, getConfig } = require('../services/aiServiceClient');

const AI_ENABLED = String(process.env.AI_ENABLED || 'false').toLowerCase() === 'true';

const isAiEnabled = () => AI_ENABLED;

const ensureEnabled = () => {
  if (!AI_ENABLED) {
    const error = new Error('AI features are disabled.');
    error.status = 503;
    error.payload = {
      error: 'AI_DISABLED',
      hint: 'Set AI_ENABLED=true to enable AI features.'
    };
    throw error;
  }
};

const upsertEmbeddings = (items, options = {}) => {
  ensureEnabled();
  return request({ path: '/embed/upsert', body: { items }, requestId: options.requestId });
};

const deleteEmbeddings = (ids, options = {}) => {
  ensureEnabled();
  return request({ path: '/embed/delete', body: { ids }, requestId: options.requestId });
};

const getEmbeddings = (ids, options = {}) => {
  ensureEnabled();
  return request({ path: '/embed/get', body: { ids }, requestId: options.requestId });
};

const embedTexts = (texts, options = {}) => {
  ensureEnabled();
  return request({ path: '/embed', body: { texts }, requestId: options.requestId });
};

const semanticSearch = (query, options = {}) => {
  ensureEnabled();
  return request({ path: '/search', body: query, requestId: options.requestId });
};

const similarTo = (payload, options = {}) => {
  ensureEnabled();
  return request({ path: '/similar', body: payload, requestId: options.requestId });
};

const checkUpstreamHealth = (options = {}) => {
  ensureEnabled();
  return health({ requestId: options.requestId });
};

const aiConfig = getConfig();

module.exports = {
  AI_ENABLED,
  AI_SERVICE_URL: aiConfig.baseUrl,
  isAiEnabled,
  upsertEmbeddings,
  deleteEmbeddings,
  getEmbeddings,
  embedTexts,
  semanticSearch,
  similarTo,
  checkUpstreamHealth
};
