import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { parseGitHubRepoInput } from '../utils/githubRepoInput';

const WIKI_PAGES_PATH = '/api/wiki/pages';

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

export const listWikiPages = async (params = {}) => {
  const res = await api.get(`${WIKI_PAGES_PATH}${buildQueryString(params)}`, getAuthHeaders());
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.pages)) return res.data.pages;
  return [];
};

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

export const createWikiPage = async (payload = {}) => {
  const res = await api.post(WIKI_PAGES_PATH, payload, getAuthHeaders());
  return res.data;
};

export const getWikiPage = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}`, getAuthHeaders());
  return res.data;
};

export const getPublicWikiPage = async (idOrSlug) => {
  const res = await api.get(`/api/public/wiki/pages/${safeId(idOrSlug)}`);
  return res.data || {};
};

export const adoptPublicWikiPage = async (idOrSlug) => {
  const res = await api.post(`/api/public/wiki/pages/${safeId(idOrSlug)}/adopt`, {}, getAuthHeaders());
  return res.data || {};
};

export const createWikiCollection = async (payload = {}) => {
  const res = await api.post('/api/wiki/collections', payload, getAuthHeaders());
  return res.data || {};
};

export const getPublicWikiCollection = async (idOrSlug) => {
  const res = await api.get(`/api/public/wiki/collections/${safeId(idOrSlug)}`);
  return res.data || {};
};

export const adoptPublicWikiCollection = async (idOrSlug) => {
  const res = await api.post(`/api/public/wiki/collections/${safeId(idOrSlug)}/adopt`, {}, getAuthHeaders());
  return res.data || {};
};

export const listWikiStarterPacks = async () => {
  const res = await api.get('/api/public/wiki/starter-packs');
  return Array.isArray(res.data?.packs) ? res.data.packs : [];
};

export const getWikiStarterPack = async (packId) => {
  const res = await api.get(`/api/public/wiki/starter-packs/${safeId(packId)}`);
  return res.data || {};
};

export const adoptWikiStarterPack = async (packId) => {
  const res = await api.post(`/api/public/wiki/starter-packs/${safeId(packId)}/adopt`, {}, getAuthHeaders());
  return res.data || {};
};

export const getWikiPageMarkdown = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/markdown`, {
    ...getAuthHeaders(),
    responseType: 'text',
    transformResponse: [data => data]
  });
  return String(res.data || '');
};

export const getWikiExportZipUrl = () => apiUrl('/api/wiki/export.zip');

export const downloadWikiExportZip = async () => {
  const res = await api.get('/api/wiki/export.zip', {
    ...getAuthHeaders(),
    responseType: 'blob'
  });
  return res.data;
};

export const lintWiki = async ({ pageId = '' } = {}) => {
  const res = await api.post('/api/wiki/lint', { pageId }, getAuthHeaders());
  return res.data || {};
};

export const streamLintWiki = async ({ pageId = '' } = {}, handlers = {}) => {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/wiki/lint/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ pageId })
  });

  if (!res.ok) {
    let message = 'Failed to lint wiki.';
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
    handlers.onRun?.(body);
    return body;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalRun = null;
  let streamError = null;

  const consumeBlock = (block) => {
    const { event, payload } = parseSseBlock(block);
    if (!payload) return;
    handlers.onEvent?.(event, payload);
    if (payload.run) {
      finalRun = payload.run;
      handlers.onRun?.(payload.run, payload);
    }
    if (event === 'error') {
      streamError = new Error(payload.error || payload.message || 'Failed to lint wiki.');
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
  if (streamError) throw streamError;
  return finalRun;
};

export const getWikiLintRun = async (runId) => {
  const res = await api.get(`/api/wiki/lint/${safeId(runId)}`, getAuthHeaders());
  return res.data || {};
};

const mutateWikiLintFinding = async (runId, findingId, action) => {
  const res = await api.post(
    `/api/wiki/lint/${safeId(runId)}/findings/${safeId(findingId)}/${safeId(action)}`,
    {},
    getAuthHeaders()
  );
  return res.data || {};
};

export const acceptWikiLintFinding = (runId, findingId) => mutateWikiLintFinding(runId, findingId, 'accept');
export const ignoreWikiLintFinding = (runId, findingId) => mutateWikiLintFinding(runId, findingId, 'ignore');
export const fixWikiLintFinding = (runId, findingId) => mutateWikiLintFinding(runId, findingId, 'fix');

export const updateWikiPage = async (id, updates = {}) => {
  const res = await api.patch(`${WIKI_PAGES_PATH}/${safeId(id)}`, updates, getAuthHeaders());
  return res.data;
};

export const archiveWikiPage = async (id) => {
  const res = await api.delete(`${WIKI_PAGES_PATH}/${safeId(id)}`, getAuthHeaders());
  return res.data;
};

export const deleteWikiPage = archiveWikiPage;

export const maintainWikiPage = async (id, options = {}) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/ai/draft`, options, getAuthHeaders());
  return res.data;
};

export const draftWikiPage = maintainWikiPage;

const WIKI_STREAM_READ_TIMEOUT_MS = 24000;

export const streamMaintainWikiPage = async (id, options = {}, handlers = {}) => {
  const pageId = String(id || '').trim();
  const token = localStorage.getItem('token');
  const controller = new AbortController();
  const overrideMs = Number(window.__NOEIS_WIKI_STREAM_READ_TIMEOUT_MS__);
  const timeoutMs = Number.isFinite(overrideMs) ? overrideMs : WIKI_STREAM_READ_TIMEOUT_MS;
  let timeoutId = null;
  const clearReadTimeout = () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = null;
  };
  const armReadTimeout = () => {
    clearReadTimeout();
    if (timeoutMs <= 0) return;
    timeoutId = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);
  };
  armReadTimeout();
  const res = await fetch(apiUrl(`${WIKI_PAGES_PATH}/${safeId(pageId)}/ai/draft/stream`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(options || {}),
    signal: controller.signal
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
      handlers.onPage?.(payload.page, payload);
    }
    if (event === 'error') {
      streamError = new Error(payload.error || payload.message || 'Failed to maintain wiki page.');
    }
  };

  try {
    while (true) {
      armReadTimeout();
      const { done, value } = await reader.read();
      clearReadTimeout();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      blocks.forEach(consumeBlock);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Wiki maintenance stream timed out.');
    }
    throw error;
  } finally {
    clearReadTimeout();
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeBlock(buffer);
  if (streamError) throw streamError;
  return finalPage;
};

export const addWikiSource = async (id, source = {}) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/sources`, source, getAuthHeaders());
  return res.data;
};

export const removeWikiSource = async (id, sourceRefId) => {
  const res = await api.delete(`${WIKI_PAGES_PATH}/${safeId(id)}/sources/${safeId(sourceRefId)}`, getAuthHeaders());
  return res.data;
};

export const askWikiPage = async (id, question) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/ask`, { question }, getAuthHeaders());
  return res.data;
};

export const streamAskWikiPage = async (id, question, handlers = {}) => {
  const pageId = String(id || '').trim();
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl(`${WIKI_PAGES_PATH}/${safeId(pageId)}/ask/stream`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ question })
  });

  if (!res.ok) {
    let message = 'Failed to ask wiki page.';
    try {
      const body = await res.json();
      message = body?.error || message;
    } catch (_error) {
      // Preserve the generic error if the stream endpoint did not return JSON.
    }
    throw new Error(message);
  }

  if (!res.body?.getReader) {
    return askWikiPage(pageId, question);
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
    if (event === 'wiki-ask-delta' && typeof payload.delta === 'string') {
      handlers.onDelta?.(payload.delta, payload);
    }
    if (payload.page) {
      finalPage = payload.page;
      handlers.onPage?.(payload.page, payload);
    }
    if (event === 'error') {
      streamError = new Error(payload.error || payload.message || 'Failed to ask wiki page.');
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
  if (streamError) throw streamError;
  return finalPage;
};

export const removeWikiDiscussion = async (id, discussionId) => {
  const res = await api.delete(`${WIKI_PAGES_PATH}/${safeId(id)}/discussions/${safeId(discussionId)}`, getAuthHeaders());
  return res.data;
};

export const promoteWikiDiscussion = async (id, discussionId, payload = {}) => {
  const res = await api.post(
    `${WIKI_PAGES_PATH}/${safeId(id)}/discussions/${safeId(discussionId)}/promote`,
    payload,
    getAuthHeaders()
  );
  return res.data;
};

export const getWikiBacklinks = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/backlinks`, getAuthHeaders());
  return res.data;
};

export const getWikiAutolinkSuggestions = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/autolinks`, getAuthHeaders());
  return res.data;
};

export const getWikiBriefing = async () => {
  const res = await api.get('/api/wiki/briefing', getAuthHeaders());
  return res.data;
};

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
  return res.data || {};
};

export const getWikiIngestRun = async (runId) => {
  const res = await api.get(`/api/wiki/ingest/${safeId(runId)}`, getAuthHeaders());
  return res.data || {};
};

export const undoWikiIngestRun = async (runId) => {
  const res = await api.post(`/api/wiki/ingest/${safeId(runId)}/undo`, {}, getAuthHeaders());
  return res.data || {};
};

export const reviewWikiIngestRun = async (runId, action, options = '') => {
  const payload = typeof options === 'string'
    ? { action, note: options }
    : { action, ...(options || {}) };
  const res = await api.post(`/api/wiki/ingest/${safeId(runId)}/review`, payload, getAuthHeaders());
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

export const listWikiActivity = async (params = {}) => {
  const res = await api.get(`/api/wiki/activity${buildQueryString(params)}`, getAuthHeaders());
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.events)) return res.data.events;
  return [];
};

export const suggestWikiSchemaUpdates = async ({ currentSchema = '', limit } = {}) => {
  const res = await api.post('/api/wiki/schema/suggestions', { currentSchema, limit }, getAuthHeaders());
  return res.data || {};
};

export const processWikiSourceEvent = async (sourceEventId) => {
  const res = await api.post(`/api/wiki/source-events/${safeId(sourceEventId)}/process`, {}, getAuthHeaders());
  return res.data;
};

export const processPendingWikiSourceEvents = async () => {
  const res = await api.post('/api/wiki/source-events/process-pending', {}, getAuthHeaders());
  return res.data;
};

export const listWikiRevisions = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/revisions`, getAuthHeaders());
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.revisions)) return res.data.revisions;
  return [];
};

export const listWikiConnectorActions = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/connector-actions`, getAuthHeaders());
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.actions)) return res.data.actions;
  return [];
};

export const listWikiAutolinks = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/autolinks`, getAuthHeaders());
  return {
    suggestions: Array.isArray(res.data?.suggestions) ? res.data.suggestions : [],
    scanned: Number.isFinite(Number(res.data?.scanned)) ? Number(res.data.scanned) : 0
  };
};

export const applyWikiAutolink = async (id, targetPageId) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/autolinks/${safeId(targetPageId)}/apply`, {}, getAuthHeaders());
  return res.data;
};

export const reviewWikiFreshness = async (id) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/freshness/review`, {}, getAuthHeaders());
  return res.data;
};

export const armEdgarWatch = async (pageId, { ticker = '', cik = '' } = {}) => {
  const payload = {};
  const normalizedTicker = String(ticker || '').trim();
  const normalizedCik = String(cik || '').trim();
  if (normalizedTicker) payload.ticker = normalizedTicker;
  if (normalizedCik) payload.cik = normalizedCik;
  try {
    const res = await api.post(
      `${WIKI_PAGES_PATH}/${safeId(pageId)}/edgar-watch`,
      payload,
      getAuthHeaders()
    );
    return res.data || {};
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || 'Failed to arm EDGAR watch.';
    throw new Error(message);
  }
};

export const armTranscriptWatch = async (pageId, { ticker = '' } = {}) => {
  const payload = {};
  const normalizedTicker = String(ticker || '').trim();
  if (normalizedTicker) payload.ticker = normalizedTicker;
  try {
    const res = await api.post(
      `${WIKI_PAGES_PATH}/${safeId(pageId)}/transcript-watch`,
      payload,
      getAuthHeaders()
    );
    return res.data || {};
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || 'Failed to arm earnings transcript watch.';
    throw new Error(message);
  }
};

export const createRepoWikiFromGitHub = async (repoInput = '') => {
  const parsed = parseGitHubRepoInput(repoInput);
  if (!parsed) {
    throw new Error('Enter a public GitHub repository as owner/repo or a github.com URL.');
  }
  try {
    const res = await api.post(
      `${WIKI_PAGES_PATH}/from-github`,
      { repo: parsed.fullName },
      getAuthHeaders()
    );
    const watchResult = res.data || {};
    const action = watchResult?.action === 'updated' ? 'updated' : 'created';
    return {
      page: watchResult?.page,
      repo: watchResult?.repo || parsed,
      action,
      watchResult
    };
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || 'Failed to create repo wiki.';
    throw new Error(message);
  }
};

export const armGitHubRepoWatch = async (pageId, { repo = '', repoUrl = '', owner = '', repoName = '' } = {}) => {
  const payload = {};
  const normalizedRepo = String(repo || repoUrl || '').trim();
  const normalizedOwner = String(owner || '').trim();
  const normalizedRepoName = String(repoName || '').trim();
  if (normalizedRepo) payload.repo = normalizedRepo;
  if (normalizedOwner) payload.owner = normalizedOwner;
  if (normalizedRepoName) payload.repoName = normalizedRepoName;
  try {
    const res = await api.post(
      `${WIKI_PAGES_PATH}/${safeId(pageId)}/github-repo-watch`,
      payload,
      getAuthHeaders()
    );
    return res.data || {};
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || 'Failed to arm GitHub repo watch.';
    throw new Error(message);
  }
};

export const rebuildWikiPageGraph = async (id) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/graph/rebuild`, {}, getAuthHeaders());
  return res.data || {};
};

export const rebuildWikiGraph = async ({ limit = 500 } = {}) => {
  const res = await api.post('/api/wiki/graph/rebuild', { limit }, getAuthHeaders());
  return res.data || {};
};

export const writeWikiPageToConnector = async (id, connector, payload = {}) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/write-back/${safeId(connector)}`, payload, getAuthHeaders());
  return res.data || {};
};

export const createLibrarySourceProvenanceFixture = async () => {
  const res = await api.post('/api/debug/fixtures/library-source-provenance', {}, getAuthHeaders());
  return res.data || {};
};

export const clearLibrarySourceProvenanceFixture = async () => {
  const res = await api.delete('/api/debug/fixtures/library-source-provenance', getAuthHeaders());
  return res.data || {};
};

const wikiApi = {
  listWikiPages,
  createWikiPage,
  getWikiPage,
  getPublicWikiPage,
  getWikiPageMarkdown,
  getWikiExportZipUrl,
  downloadWikiExportZip,
  lintWiki,
  streamLintWiki,
  getWikiLintRun,
  acceptWikiLintFinding,
  ignoreWikiLintFinding,
  fixWikiLintFinding,
  updateWikiPage,
  archiveWikiPage,
  deleteWikiPage,
  maintainWikiPage,
  draftWikiPage,
  streamMaintainWikiPage,
  addWikiSource,
  removeWikiSource,
  askWikiPage,
  streamAskWikiPage,
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
  reviewWikiIngestRun,
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
  armEdgarWatch,
  armTranscriptWatch,
  armGitHubRepoWatch,
  createRepoWikiFromGitHub,
  rebuildWikiPageGraph,
  rebuildWikiGraph,
  writeWikiPageToConnector,
  createLibrarySourceProvenanceFixture,
  clearLibrarySourceProvenanceFixture
};

export default wikiApi;
