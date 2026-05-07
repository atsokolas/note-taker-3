const mongoose = require('mongoose');

const SOURCE_TYPES = new Set(['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external']);
const EVENT_TYPES = new Set(['created', 'updated', 'deleted', 'imported', 'synced']);

const trim = (value = '', limit = 1000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
};

const normalizeObjectId = (value) => {
  const id = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const createWikiSourceEvent = async ({
  WikiSourceEvent,
  userId,
  sourceType,
  sourceObjectId = null,
  parentObjectId = null,
  provider = '',
  eventType = 'updated',
  title = '',
  summary = '',
  url = '',
  sourceUpdatedAt = null,
  affectedPageIds = [],
  metadata = {}
} = {}) => {
  if (!WikiSourceEvent || !userId) return null;
  const normalizedSourceType = SOURCE_TYPES.has(String(sourceType || '')) ? String(sourceType) : '';
  if (!normalizedSourceType) return null;
  const normalizedEventType = EVENT_TYPES.has(String(eventType || '')) ? String(eventType) : 'updated';
  const event = new WikiSourceEvent({
    userId,
    sourceType: normalizedSourceType,
    sourceObjectId: normalizeObjectId(sourceObjectId),
    parentObjectId: normalizeObjectId(parentObjectId),
    provider: trim(provider, 80),
    eventType: normalizedEventType,
    title: trim(title, 240),
    summary: trim(summary, 1200),
    url: trim(url, 1000),
    sourceUpdatedAt: sourceUpdatedAt ? new Date(sourceUpdatedAt) : null,
    affectedPageIds: Array.isArray(affectedPageIds)
      ? affectedPageIds.map(normalizeObjectId).filter(Boolean).slice(0, 50)
      : [],
    metadata: metadata && typeof metadata === 'object' ? metadata : {}
  });
  await event.save();
  return event;
};

const listWikiSourceEvents = async ({ WikiSourceEvent, userId, status = '', limit = 40 } = {}) => {
  if (!WikiSourceEvent || !userId) return [];
  const query = { userId };
  if (status) query.status = status;
  const result = WikiSourceEvent.find(query).sort({ createdAt: -1 }).limit(Math.max(1, Math.min(Number(limit) || 40, 100))).lean();
  return Array.isArray(await result) ? await result : [];
};

module.exports = {
  createWikiSourceEvent,
  listWikiSourceEvents
};
