import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearCached, clearCachedPrefix, fetchWithCache } from '../utils/cache';

const WIKI_PAGES_PATH = '/api/wiki/pages';
const PAGE_CACHE_TTL_MS = 30 * 1000;
const PAGE_RAIL_CACHE_TTL_MS = 60 * 1000;
const WIKI_LIST_CACHE_TTL_MS = 20 * 1000;

const safeId = (id) => encodeURIComponent(String(id || '').trim());

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
};

const wikiPageCacheKey = (id) => `wiki:page:${safeId(id)}`;
const wikiPageRailCacheKey = (id, rail) => `wiki:page:${safeId(id)}:${rail}`;
const wikiListCacheKey = (params = {}) => `wiki:pages:${buildQueryString(params) || '?'}`;

const apiUrl = (path = '') => {
  const base = String(api.defaults?.baseURL || '').trim();
  if (!base) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/+$/g, '')}/${String(path || '').replace(/^\/+/g, '')}`;
};

const parseSseBlock = (block = '') => {
  let event = 'message';
  const data = [];
  String(block || '').split(/\r?\n/).forEach((line) => {
    if (line.startsWith('event:')) event = line.slice(6).trim() || 'message';
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  });
  const raw = data.join('\n');
  if (!raw) return { event, payload: null };
  try {
    return { event, payload: JSON.parse(raw) };
  } catch (_error) {
    return { event, payload: { raw } };
  }
};

const clearWikiPageCaches = (id = '') => {
  if (id) clearCachedPrefix(`wiki:page:${safeId(id)}`);
  clearCachedPrefix('wiki:pages:');
  clearCached('wiki:briefing');
  clearCachedPrefix('wiki:activity:');
};

const clearWikiCollectionCaches = () => {
  clearCachedPrefix('wiki:page:');
  clearCachedPrefix('wiki:pages:');
  clearCached('wiki:briefing');
  clearCachedPrefix('wiki:activity:');
};

export const listWikiPages = async (params = {}) => fetchWithCache(
  wikiListCacheKey(params),
  async () => {
    const res = await api.get(`${WIKI_PAGES_PATH}${buildQueryString(params)}`, getAuthHeaders());
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.pages)) return res.data.pages;
    return [];
  },
  { ttlMs: WIKI_LIST_CACHE_TTL_MS, force: Boolean(params?.force) }
);

export const createWikiPage = async (payload = {}) => {
  const res = await api.post(WIKI_PAGES_PATH, payload, getAuthHeaders());
  clearWikiCollectionCaches();
  return res.data;
};

export const getWikiPage = async (id, { force = false } = {}) => fetchWithCache(
  wikiPageCacheKey(id),
  async () => {
    const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}`, getAuthHeaders());
    return res.data;
  },
  { ttlMs: PAGE_CACHE_TTL_MS, force }
);

export const prefetchWikiPage = (id) => {
  if (!String(id || '').trim()) return Promise.resolve(null);
  return getWikiPage(id).catch(() => null);
};

export const updateWikiPage = async (id, updates = {}) => {
  const res = await api.patch(`${WIKI_PAGES_PATH}/${safeId(id)}`, updates, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data;
};

export const archiveWikiPage = async (id) => {
  const res = await api.delete(`${WIKI_PAGES_PATH}/${safeId(id)}`, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data;
};

export const deleteWikiPage = archiveWikiPage;

export const maintainWikiPage = async (id, options = {}) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/ai/draft`, options, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data;
};

export const draftWikiPage = maintainWikiPage;

export const streamMaintainWikiPage = async (id, options = {}, handlers = {}) => {
  const pageId = String(id || '').trim();
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl(`${WIKI_PAGES_PATH}/${safeId(pageId)}/ai/draft/stream`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(options || {})
  });

  if (!res.ok) {
    let message = 'Failed to maintain wiki page.';
    try {
      const body = await res.json();
      message = body?.error || message;
    } catch (_error) {
      // Preserve the generic error if the stream endpoint did not return JSON.
    }
    throw new Error(message);
  }

  if (!res.body?.getReader) {
    const body = await res.json();
    clearWikiPageCaches(pageId);
    handlers.onPage?.(body);
    return body;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPage = null;
  let streamError = null;

  const consumeBlock = (block) => {
    const { event, payload } = parseSseBlock(block);
    if (!payload) return;
    handlers.onEvent?.(event, payload);
    if (payload.page) {
      finalPage = payload.page;
      clearWikiPageCaches(payload.page._id || payload.page.id || pageId);
      handlers.onPage?.(payload.page, payload);
    }
    if (event === 'error') {
      streamError = new Error(payload.error || payload.message || 'Failed to maintain wiki page.');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    blocks.forEach(consumeBlock);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeBlock(buffer);
  clearWikiPageCaches(pageId);
  if (streamError) throw streamError;
  return finalPage;
};

export const addWikiSource = async (id, source = {}) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/sources`, source, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data;
};

export const removeWikiSource = async (id, sourceRefId) => {
  const res = await api.delete(`${WIKI_PAGES_PATH}/${safeId(id)}/sources/${safeId(sourceRefId)}`, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data;
};

export const askWikiPage = async (id, question) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/ask`, { question }, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data;
};

export const removeWikiDiscussion = async (id, discussionId) => {
  const res = await api.delete(`${WIKI_PAGES_PATH}/${safeId(id)}/discussions/${safeId(discussionId)}`, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data;
};

export const promoteWikiDiscussion = async (id, discussionId, payload = {}) => {
  const res = await api.post(
    `${WIKI_PAGES_PATH}/${safeId(id)}/discussions/${safeId(discussionId)}/promote`,
    payload,
    getAuthHeaders()
  );
  clearWikiPageCaches(id);
  clearWikiCollectionCaches();
  return res.data;
};

export const getWikiBacklinks = async (id, { force = false } = {}) => fetchWithCache(
  wikiPageRailCacheKey(id, 'backlinks'),
  async () => {
    const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/backlinks`, getAuthHeaders());
    return res.data;
  },
  { ttlMs: PAGE_RAIL_CACHE_TTL_MS, force }
);

export const getWikiAutolinkSuggestions = async (id, { force = false } = {}) => fetchWithCache(
  wikiPageRailCacheKey(id, 'autolinks'),
  async () => {
    const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/autolinks`, getAuthHeaders());
    return res.data;
  },
  { ttlMs: PAGE_RAIL_CACHE_TTL_MS, force }
);

export const getWikiBriefing = async ({ force = false } = {}) => fetchWithCache(
  'wiki:briefing',
  async () => {
    const res = await api.get('/api/wiki/briefing', getAuthHeaders());
    return res.data;
  },
  { ttlMs: WIKI_LIST_CACHE_TTL_MS, force }
);

export const listWikiProposals = async () => {
  const res = await api.get('/api/wiki/proposals', getAuthHeaders());
  return {
    proposals: Array.isArray(res.data?.proposals) ? res.data.proposals : [],
    generated: Boolean(res.data?.generated)
  };
};

export const refreshWikiProposals = async ({ force = false } = {}) => {
  const res = await api.post('/api/wiki/proposals/generate-background', { force }, getAuthHeaders());
  return {
    proposals: Array.isArray(res.data?.proposals) ? res.data.proposals : [],
    generated: Boolean(res.data?.generated)
  };
};

export const acceptWikiProposal = async (proposalId) => {
  const res = await api.post(`/api/wiki/proposals/${safeId(proposalId)}/accept`, {}, getAuthHeaders());
  clearWikiCollectionCaches();
  return res.data;
};

export const watchWikiProposal = async (proposalId) => {
  const res = await api.post(`/api/wiki/proposals/${safeId(proposalId)}/watch`, {}, getAuthHeaders());
  return res.data;
};

export const dismissWikiProposal = async (proposalId, reason = '') => {
  const res = await api.post(`/api/wiki/proposals/${safeId(proposalId)}/dismiss`, { reason }, getAuthHeaders());
  return res.data;
};

export const mergeWikiProposal = async (proposalId, pageId) => {
  const res = await api.post(`/api/wiki/proposals/${safeId(proposalId)}/merge`, { pageId }, getAuthHeaders());
  clearWikiPageCaches(pageId);
  return res.data;
};

export const listWikiSourceEvents = async (params = {}) => {
  const res = await api.get(`/api/wiki/source-events${buildQueryString(params)}`, getAuthHeaders());
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.events)) return res.data.events;
  return [];
};

export const ingestWikiSource = async (source = {}) => {
  const res = await api.post('/api/wiki/ingest', { source }, getAuthHeaders());
  clearWikiCollectionCaches();
  return res.data || {};
};

export const getWikiIngestRun = async (runId) => {
  const res = await api.get(`/api/wiki/ingest/${safeId(runId)}`, getAuthHeaders());
  return res.data || {};
};

export const undoWikiIngestRun = async (runId) => {
  const res = await api.post(`/api/wiki/ingest/${safeId(runId)}/undo`, {}, getAuthHeaders());
  clearWikiCollectionCaches();
  return res.data || {};
};

export const getWikiSchema = async () => {
  const res = await api.get('/api/wiki/schema', getAuthHeaders());
  return res.data || {};
};

export const saveWikiSchema = async (content = '') => {
  const res = await api.put('/api/wiki/schema', { content }, getAuthHeaders());
  return res.data || {};
};

export const revertWikiSchema = async (snapshotId) => {
  const res = await api.post('/api/wiki/schema/revert', { snapshotId }, getAuthHeaders());
  return res.data || {};
};

export const listWikiActivity = async (params = {}) => fetchWithCache(
  `wiki:activity:${buildQueryString(params) || '?'}`,
  async () => {
    const res = await api.get(`/api/wiki/activity${buildQueryString(params)}`, getAuthHeaders());
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.events)) return res.data.events;
    return [];
  },
  { ttlMs: WIKI_LIST_CACHE_TTL_MS, force: Boolean(params?.force) }
);

export const suggestWikiSchemaUpdates = async ({ currentSchema = '', limit } = {}) => {
  const res = await api.post('/api/wiki/schema/suggestions', { currentSchema, limit }, getAuthHeaders());
  return res.data || {};
};

export const processWikiSourceEvent = async (sourceEventId) => {
  const res = await api.post(`/api/wiki/source-events/${safeId(sourceEventId)}/process`, {}, getAuthHeaders());
  clearWikiCollectionCaches();
  return res.data;
};

export const processPendingWikiSourceEvents = async () => {
  const res = await api.post('/api/wiki/source-events/process-pending', {}, getAuthHeaders());
  clearWikiCollectionCaches();
  return res.data;
};

export const listWikiRevisions = async (id, { force = false } = {}) => fetchWithCache(
  wikiPageRailCacheKey(id, 'revisions'),
  async () => {
    const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/revisions`, getAuthHeaders());
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.revisions)) return res.data.revisions;
    return [];
  },
  { ttlMs: PAGE_RAIL_CACHE_TTL_MS, force }
);

export const listWikiConnectorActions = async (id, { force = false } = {}) => fetchWithCache(
  wikiPageRailCacheKey(id, 'connector-actions'),
  async () => {
    const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/connector-actions`, getAuthHeaders());
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.actions)) return res.data.actions;
    return [];
  },
  { ttlMs: PAGE_RAIL_CACHE_TTL_MS, force }
);

export const listWikiAutolinks = async (id) => {
  const res = await getWikiAutolinkSuggestions(id);
  return {
    suggestions: Array.isArray(res?.suggestions) ? res.suggestions : [],
    scanned: Number.isFinite(Number(res?.scanned)) ? Number(res.scanned) : 0
  };
};

export const applyWikiAutolink = async (id, targetPageId) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/autolinks/${safeId(targetPageId)}/apply`, {}, getAuthHeaders());
  clearWikiPageCaches(id);
  clearWikiPageCaches(targetPageId);
  return res.data;
};

export const reviewWikiFreshness = async (id) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/freshness/review`, {}, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data;
};

export const rebuildWikiPageGraph = async (id) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/graph/rebuild`, {}, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data || {};
};

export const writeWikiPageToConnector = async (id, connector, payload = {}) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/write-back/${safeId(connector)}`, payload, getAuthHeaders());
  clearWikiPageCaches(id);
  return res.data || {};
};

const wikiApi = {
  listWikiPages,
  createWikiPage,
  getWikiPage,
  prefetchWikiPage,
  updateWikiPage,
  archiveWikiPage,
  deleteWikiPage,
  maintainWikiPage,
  draftWikiPage,
  addWikiSource,
  removeWikiSource,
  askWikiPage,
  removeWikiDiscussion,
  promoteWikiDiscussion,
  getWikiBacklinks,
  getWikiAutolinkSuggestions,
  getWikiBriefing,
  listWikiProposals,
  refreshWikiProposals,
  acceptWikiProposal,
  watchWikiProposal,
  dismissWikiProposal,
  mergeWikiProposal,
  ingestWikiSource,
  getWikiIngestRun,
  undoWikiIngestRun,
  getWikiSchema,
  saveWikiSchema,
  revertWikiSchema,
  listWikiActivity,
  suggestWikiSchemaUpdates,
  listWikiSourceEvents,
  processWikiSourceEvent,
  processPendingWikiSourceEvents,
  listWikiRevisions,
  listWikiConnectorActions,
  listWikiAutolinks,
  applyWikiAutolink,
  reviewWikiFreshness,
  rebuildWikiPageGraph,
  writeWikiPageToConnector
};

export default wikiApi;
