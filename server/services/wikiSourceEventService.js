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

const firstString = (...values) => values
  .map(value => trim(value, 8000))
  .find(Boolean) || '';

const normalizeProvider = (value = '') => trim(value, 80).toLowerCase();

const connectorSourceType = ({ provider = '', payload = {} } = {}) => {
  const rawType = String(payload.sourceType || payload.type || '').toLowerCase();
  if (SOURCE_TYPES.has(rawType)) return rawType;
  if (provider === 'notion' || provider === 'evernote') return 'notebook';
  if (provider === 'readwise') {
    if (payload.highlight || payload.highlightId || payload.highlight_id || rawType === 'highlight') return 'highlight';
    return 'article';
  }
  return 'external';
};

const connectorEventType = (payload = {}) => {
  const raw = String(payload.eventType || payload.action || '').toLowerCase();
  if (EVENT_TYPES.has(raw)) return raw;
  if (raw === 'create') return 'created';
  if (raw === 'update') return 'updated';
  if (raw === 'delete') return 'deleted';
  return payload.syncedAt || payload.syncCursor ? 'synced' : 'imported';
};

const connectorExternalId = (payload = {}) => firstString(
  payload.externalId,
  payload.external_id,
  payload.pageId,
  payload.page_id,
  payload.guid,
  payload.id,
  payload.book_id,
  payload.highlightId,
  payload.highlight_id
);

const connectorTitle = ({ provider = '', payload = {} } = {}) => {
  if (provider === 'readwise' && payload.highlight) {
    return firstString(payload.highlight.title, payload.title, payload.bookTitle, payload.book_title, 'Readwise highlight');
  }
  return firstString(payload.title, payload.name, payload.bookTitle, payload.book_title, payload.pageTitle, payload.page_title, 'Untitled source');
};

const connectorText = ({ provider = '', payload = {} } = {}) => {
  if (provider === 'readwise' && payload.highlight) {
    return firstString(
      [payload.highlight.text, payload.highlight.note].filter(Boolean).join(' - '),
      payload.text,
      payload.summary
    );
  }
  const highlightText = Array.isArray(payload.highlights)
    ? payload.highlights.map(highlight => [highlight.text, highlight.note].filter(Boolean).join(' - ')).filter(Boolean).join('\n')
    : '';
  const blockText = Array.isArray(payload.blocks)
    ? payload.blocks.map(block => (typeof block === 'string' ? block : block?.text)).filter(Boolean).join('\n')
    : '';
  return firstString(payload.text, payload.content, payload.summary, payload.description, blockText, highlightText);
};

const connectorUrl = (payload = {}) => firstString(
  payload.url,
  payload.sourceUrl,
  payload.source_url,
  payload.readwise_url,
  payload.webUrl,
  payload.web_url
);

const connectorUpdatedAt = (payload = {}) => (
  payload.sourceUpdatedAt
  || payload.updatedAt
  || payload.updated_at
  || payload.last_edited_time
  || payload.highlighted_at
  || payload.created_at
  || null
);

const connectorMetadata = ({ provider = '', payload = {}, metadata = {} } = {}) => ({
  connector: provider,
  source: firstString(payload.source, payload.sourceType, payload.importSource, metadata.source),
  importMeta: payload.importMeta || metadata.importMeta || null,
  rawExternalId: connectorExternalId(payload),
  ...metadata
});

const createConnectorWikiSourceEvent = async ({
  WikiSourceEvent,
  userId,
  provider = '',
  payload = {},
  sourceObjectId = null,
  parentObjectId = null,
  importSessionId = null,
  affectedPageIds = [],
  metadata = {}
} = {}) => {
  const normalizedProvider = normalizeProvider(provider || payload.provider);
  if (!normalizedProvider || !payload || typeof payload !== 'object') return null;
  const text = connectorText({ provider: normalizedProvider, payload });
  return createWikiSourceEvent({
    WikiSourceEvent,
    userId,
    sourceType: connectorSourceType({ provider: normalizedProvider, payload }),
    sourceObjectId: sourceObjectId || payload.sourceObjectId || payload.source_object_id || payload._id || null,
    parentObjectId: parentObjectId || payload.parentObjectId || payload.parent_object_id || payload.parentId || null,
    provider: normalizedProvider,
    externalId: connectorExternalId(payload),
    importSessionId: importSessionId || payload.importSessionId || payload.import_session_id || null,
    eventType: connectorEventType(payload),
    title: connectorTitle({ provider: normalizedProvider, payload }),
    summary: firstString(payload.summary, text),
    text,
    url: connectorUrl(payload),
    sourceUpdatedAt: connectorUpdatedAt(payload),
    affectedPageIds: payload.affectedPageIds || payload.affected_page_ids || affectedPageIds,
    metadata: connectorMetadata({ provider: normalizedProvider, payload, metadata })
  });
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
  status = 'pending',
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
    text: trim(text, String(provider || '').trim().toLowerCase() === 'sec-edgar' ? 120000 : 8000),
    url: trim(url, 1000),
    sourceUpdatedAt: sourceUpdatedAt ? new Date(sourceUpdatedAt) : null,
    affectedPageIds: Array.isArray(affectedPageIds)
      ? affectedPageIds.map(normalizeObjectId).filter(Boolean).slice(0, 50)
      : [],
    status: ['pending', 'processing', 'processed', 'failed', 'ignored'].includes(status) ? status : 'pending',
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
  const resolved = await result;
  const events = Array.isArray(resolved) ? resolved : [];
  if (status) return events;
  return events.sort((a, b) => statusRank(a.status) - statusRank(b.status) || new Date(b.createdAt) - new Date(a.createdAt));
};

module.exports = {
  createConnectorWikiSourceEvent,
  createWikiSourceEvent,
  listWikiSourceEvents
};
