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

const statusRank = (status = '') => {
  if (status === 'failed') return 0;
  if (status === 'pending') return 1;
  if (status === 'processing') return 2;
  if (status === 'processed') return 3;
  return 4;
};

const createWikiSourceEvent = async ({
  WikiSourceEvent,
  userId,
  sourceType,
  sourceObjectId = null,
  parentObjectId = null,
  provider = '',
  externalId = '',
  importSessionId = null,
  eventType = 'updated',
  title = '',
  summary = '',
  text = '',
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
    externalId: trim(externalId, 240),
    importSessionId: normalizeObjectId(importSessionId),
    eventType: normalizedEventType,
    title: trim(title, 240),
    summary: trim(summary, 1200),
    text: trim(text, 8000),
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
  const events = Array.isArray(await result) ? await result : [];
  if (status) return events;
  return events.sort((a, b) => statusRank(a.status) - statusRank(b.status) || new Date(b.createdAt) - new Date(a.createdAt));
};

module.exports = {
  createWikiSourceEvent,
  listWikiSourceEvents
};
