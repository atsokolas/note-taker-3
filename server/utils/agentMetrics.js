const startedAt = new Date().toISOString();
const counters = new Map();

const normalizePart = (value) => String(value || '').trim().toLowerCase();

const buildKey = (event, tags = {}) => {
  const safeEvent = normalizePart(event) || 'unknown';
  const tagEntries = Object.entries(tags || {})
    .map(([key, value]) => [normalizePart(key), normalizePart(value)])
    .filter(([key, value]) => key && value)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (tagEntries.length === 0) return safeEvent;
  const suffix = tagEntries.map(([key, value]) => `${key}=${value}`).join('|');
  return `${safeEvent}|${suffix}`;
};

const incrementAgentMetric = (event, tags = {}) => {
  const key = buildKey(event, tags);
  const next = (counters.get(key) || 0) + 1;
  counters.set(key, next);
  return next;
};

const logAgentMetric = (event, tags = {}, extra = {}) => {
  const value = incrementAgentMetric(event, tags);
  console.info('[AGENT-METRIC]', {
    event,
    tags,
    value,
    ...extra
  });
  return value;
};

const getAgentMetricsSnapshot = () => {
  const rows = Array.from(counters.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    startedAt,
    updatedAt: new Date().toISOString(),
    rows
  };
};

module.exports = {
  incrementAgentMetric,
  logAgentMetric,
  getAgentMetricsSnapshot
};
