const parseAiServiceUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { origin: '', hasPath: false };
  try {
    const parsed = new URL(trimmed);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const hasPath = Boolean(parsed.pathname && parsed.pathname !== '/');
    return { origin, hasPath };
  } catch (err) {
    return { origin: '', hasPath: false };
  }
};

const normalizeAiServiceOrigin = (value = '') => parseAiServiceUrl(value).origin;

const joinUrl = (base = '', path = '') => {
  const safeBase = String(base || '').replace(/\/+$/, '');
  const safePath = String(path || '').replace(/^\/+/, '');
  if (!safeBase && !safePath) return '';
  if (!safeBase) return `/${safePath}`;
  if (!safePath) return safeBase;
  return `${safeBase}/${safePath}`;
};

module.exports = {
  parseAiServiceUrl,
  normalizeAiServiceOrigin,
  joinUrl
};
