import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { notifyNoeisLoopStatusChanged } from '../system/noeisLoopEvents';
import { parseGitHubRepoInput } from '../utils/githubRepoInput';
import { getPendingWikiClaimReview } from './wikiPendingClaimReview';

export { getPendingWikiClaimReview };

const WIKI_PAGES_PATH = '/api/wiki/pages';
const WIKI_REVIEW_SCAN_BATCH_SIZE = 200;
const wikiPageListRequests = new Map();
const wikiPageRequests = new Map();

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

const shareInFlightRequest = (requests, key, createRequest) => {
  const activeRequest = requests.get(key);
  if (activeRequest) return activeRequest;

  let sharedRequest;
  sharedRequest = Promise.resolve()
    .then(createRequest)
    .finally(() => {
      if (requests.get(key) === sharedRequest) requests.delete(key);
    });
  requests.set(key, sharedRequest);
  return sharedRequest;
};

const requestWikiPageList = (params = {}) => {
  const path = `${WIKI_PAGES_PATH}${buildQueryString(params)}`;
  return shareInFlightRequest(wikiPageListRequests, path, () => (
    api.get(path, getAuthHeaders()).then((res) => res.data)
  ));
};

const wikiPagesFrom = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.pages)) return payload.pages;
  return [];
};

export const listWikiPages = async (params = {}) => {
  const { scanAll = false, ...requestParams } = params;
  if (!scanAll) return wikiPagesFrom(await requestWikiPageList(requestParams));
  if (requestParams.quality !== 'needs_review') {
    throw new Error('Full Wiki scans are only available for the review queue.');
  }

  const pagesById = new Map();
  let scanCursor = 'start';
  const seenCursors = new Set();
  // The server walks immutable page ids in descending order. That makes the
  // scan finite even while page content is being updated; the set rejects a
  // malformed server cycle instead of hiding a partial queue.
  while (!seenCursors.has(scanCursor)) {
    seenCursors.add(scanCursor);
    const payload = await requestWikiPageList({
      ...requestParams,
      limit: WIKI_REVIEW_SCAN_BATCH_SIZE,
      scanCursor
    });
    wikiPagesFrom(payload).forEach(page => {
      const pageId = String(page?._id || page?.id || '');
      if (pageId && !pagesById.has(pageId)) pagesById.set(pageId, page);
    });
    const nextCursor = String(payload?.nextScanCursor || '');
    if (!nextCursor) {
      return Array.from(pagesById.values());
    }
    scanCursor = nextCursor;
  }
  throw new Error('The Wiki review queue scan did not advance. Try again.');
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

// The evidence preflight declines a build with a specific, actionable reason —
// which subject has no direct source, and what to add. Letting the raw request
// error escape replaced that with "Request failed with status code 422", so a
// correct refusal was indistinguishable from a server fault and told the owner
// nothing about how to proceed. Carry the server's own explanation.
export const createWikiPage = async (payload = {}) => {
  try {
    const res = await api.post(WIKI_PAGES_PATH, payload, getAuthHeaders());
    return res.data;
  } catch (requestError) {
    const body = requestError?.response?.data || {};
    if (!body.error && !body.code) throw requestError;
    const error = new Error(body.error || requestError?.message || 'The Wiki page could not be created.');
    error.code = body.code || '';
    error.suggestions = Array.isArray(body.suggestions) ? body.suggestions : [];
    // An evidence refusal is a verdict, not a hiccup: retrying the same title
    // against the same Library returns the same answer.
    error.retryable = body.code !== 'WIKI_BUILD_EVIDENCE_MISSING';
    throw error;
  }
};

export const createCompanyDossier = async (payload = {}) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/from-company`, payload, getAuthHeaders());
  return res.data || {};
};

export const trackCompanyDossierInJudgment = async (pageId) => {
  const res = await api.post(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/track-in-judgment`,
    {},
    getAuthHeaders()
  );
  return res.data || {};
};

export const getCompanyDossierJudgmentReview = async (pageId) => {
  const res = await api.get(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/judgment-research-review`,
    getAuthHeaders()
  );
  return res.data?.review || null;
};

export const listCompanyDossierJudgmentReviews = async ({ limit = 200 } = {}) => {
  const res = await api.get(
    '/api/wiki/judgment-research-reviews',
    { ...getAuthHeaders(), params: { limit } }
  );
  return Array.isArray(res.data?.reviews) ? res.data.reviews : [];
};

export const resolveCompanyDossierJudgmentReview = async (pageId, receiptId, resolution) => {
  const action = resolution === 'revised' ? 'revised' : 'kept';
  const res = await api.post(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/judgment-research-review/${action}`,
    { receiptId },
    getAuthHeaders()
  );
  return res.data?.receipt || null;
};

export const getJudgmentChangeProposal = async (pageId) => {
  const res = await api.get(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/judgment-change-proposal`,
    getAuthHeaders()
  );
  return res.data?.proposal || null;
};

export const proposeJudgmentChange = async (pageId, proposedJudgment) => {
  const res = await api.post(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/judgment-change-proposals`,
    { proposedJudgment },
    getAuthHeaders()
  );
  return res.data?.proposal || null;
};

export const resolveJudgmentChange = async (pageId, receiptId, action, options = {}) => {
  const selected = ['accept', 'narrow', 'preserve', 'reject', 'defer'].includes(action) ? action : '';
  if (!selected) throw new Error('Choose accept, narrow, preserve, reject, or defer.');
  const res = await api.post(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/judgment-change-proposals/${selected}`,
    { receiptId, ...(options.deferUntil ? { deferUntil: options.deferUntil } : {}) },
    getAuthHeaders()
  );
  return res.data || {};
};

export const refreshInvestmentValuation = async (pageId, payload = {}) => {
  const res = await api.post(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/valuation`,
    payload,
    getAuthHeaders()
  );
  return res.data || {};
};

export const getWikiFirstHeadCandidate = async (pageId) => {
  const res = await api.get(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/research-candidate`,
    getAuthHeaders()
  );
  return res.data || {};
};

export const reviewWikiFirstHeadCandidate = async (pageId, decision) => {
  const action = decision === 'reject' ? 'reject' : 'accept';
  const res = await api.post(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/research-candidate/${action}`,
    {},
    getAuthHeaders()
  );
  return res.data || {};
};

export const adoptWikiCurrentResearchHead = async (pageId) => {
  const res = await api.post(
    `${WIKI_PAGES_PATH}/${safeId(pageId)}/research-head/adopt`,
    { confirmation: 'ADOPT CURRENT TRUSTED HEAD' },
    getAuthHeaders()
  );
  return res.data || {};
};

export const getWikiPage = (id, params = {}) => {
  const path = `${WIKI_PAGES_PATH}/${safeId(id)}${buildQueryString(params)}`;
  return shareInFlightRequest(
    wikiPageRequests,
    path,
    () => api.get(path, getAuthHeaders()).then((res) => res.data)
  );
};

export const getPublicWikiPage = async (idOrSlug) => {
  const res = await api.get(`/api/public/wiki/pages/${safeId(idOrSlug)}`);
  return res.data || {};
};

export const getPublicWikiComparison = async (idOrSlug) => {
  const res = await api.get(`/api/public/wiki/pages/${safeId(idOrSlug)}/comparison`);
  return res.data || {};
};

export const getWikiRepoComparison = async (pageId) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(pageId)}/repo-comparison`, getAuthHeaders());
  return res.data || {};
};

export const adoptPublicWikiPage = async (idOrSlug) => {
  const res = await api.post(`/api/public/wiki/pages/${safeId(idOrSlug)}/adopt`, {}, getAuthHeaders());
  return res.data || {};
};

export const followPublicCasebook = async (idOrSlug) => {
  const res = await api.post(`/api/public/wiki/pages/${safeId(idOrSlug)}/follow`, {}, getAuthHeaders());
  return res.data || {};
};

export const unfollowPublicCasebook = async (idOrSlug) => {
  const res = await api.delete(`/api/public/wiki/pages/${safeId(idOrSlug)}/follow`, getAuthHeaders());
  return res.data || {};
};

export const forkPublicCasebook = async (idOrSlug) => {
  const res = await api.post(`/api/public/wiki/pages/${safeId(idOrSlug)}/fork`, {}, getAuthHeaders());
  return res.data || {};
};

export const exportPublicCasebook = async (idOrSlug) => {
  const res = await api.get(`/api/public/wiki/pages/${safeId(idOrSlug)}/export`);
  return res.data || {};
};

export const verifyPublicCasebook = async (casebook) => {
  const res = await api.post('/api/public/casebook/verify', { casebook });
  return res.data || {};
};

export const getWikiPublicPreview = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/public-preview`, getAuthHeaders());
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

export const getPublicProofRegistry = async () => {
  const res = await api.get('/api/public/wiki/proof');
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

const WEEKEND_READINGS_PATH = '/api/wiki/weekend-readings';

export const createWeekendReadingsDraft = async (draft = {}) => {
  const res = await api.post(`${WEEKEND_READINGS_PATH}/drafts`, draft, getAuthHeaders());
  notifyNoeisLoopStatusChanged('loop.weekly-ai');
  return res.data || {};
};

export const getWeekendReadingsStatus = async (pageId) => {
  const res = await api.get(`${WEEKEND_READINGS_PATH}/${safeId(pageId)}/status`, getAuthHeaders());
  return res.data || {};
};

const transitionWeekendReadings = async (pageId, action, confirmation) => {
  const res = await api.post(
    `${WEEKEND_READINGS_PATH}/${safeId(pageId)}/${action}`,
    { confirmation },
    getAuthHeaders()
  );
  notifyNoeisLoopStatusChanged('loop.weekly-ai');
  return res.data || {};
};

export const requestWeekendReadingsReview = pageId => transitionWeekendReadings(
  pageId,
  'review',
  'request_weekend_readings_review'
);

export const approveWeekendReadingsRevision = pageId => transitionWeekendReadings(
  pageId,
  'approve',
  'approve_weekend_readings_revision'
);

export const publishWeekendReadingsRevision = pageId => transitionWeekendReadings(
  pageId,
  'publish',
  'publish_approved_weekend_readings_revision'
);

export const saveInitialWikiJudgment = async (id) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/judgment/initial-snapshot`, {}, getAuthHeaders());
  return res.data || {};
};

export const restoreInitialWikiJudgment = async (id) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/judgment/initial-snapshot/restore`, {}, getAuthHeaders());
  return res.data || {};
};

export const archiveWikiPage = async (id) => {
  const res = await api.delete(`${WIKI_PAGES_PATH}/${safeId(id)}`, getAuthHeaders());
  return res.data;
};

export const deleteWikiPage = archiveWikiPage;

const wikiMaintenanceError = (requestError) => {
  const payload = requestError?.response?.data || {};
  const qualityFailures = Array.isArray(payload?.quality?.failures)
    ? payload.quality.failures.filter(Boolean)
    : [];
  const message = payload.error
    || requestError?.message
    || 'The Wiki rebuild was interrupted. The existing article is unchanged.';
  const error = new Error(message);
  error.code = payload.code || requestError?.code || '';
  error.page = payload.page || null;
  error.quality = payload.quality || null;
  error.qualityFailures = qualityFailures;
  error.retryable = error.code !== 'WIKI_CANDIDATE_REJECTED';
  return error;
};

export const maintainWikiPage = async (id, options = {}) => {
  try {
    const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/ai/draft`, options, getAuthHeaders());
    notifyNoeisLoopStatusChanged('loop.wiki-maintenance');
    return res.data;
  } catch (error) {
    throw wikiMaintenanceError(error);
  }
};

export const draftWikiPage = maintainWikiPage;

/**
 * Start a page build and return as soon as the server has accepted it (202).
 * The build continues server-side; poll getWikiPageBuildStatus for progress.
 */
export const startWikiPageBuild = async (id, options = {}) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/ai/draft/async`, options, getAuthHeaders());
  notifyNoeisLoopStatusChanged('loop.wiki-maintenance');
  return res.data || {};
};

/**
 * Read a detached build's state off the page itself.
 * Returns one of: maintaining | ready | error | idle.
 */
export const getWikiPageBuildStatus = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}`, getAuthHeaders());
  const page = res.data || {};
  const aiState = page.aiState || {};
  const result = {
    pageId: safeId(id),
    status: aiState.draftStatus || 'idle',
    error: aiState.lastError || '',
    errorCode: aiState.errorCode || '',
    startedAt: aiState.draftStartedAt || null,
    completedAt: aiState.draftCompletedAt || null,
    page
  };
  if (['ready', 'error'].includes(result.status)) notifyNoeisLoopStatusChanged('loop.wiki-maintenance');
  return result;
};

const WIKI_STREAM_READ_TIMEOUT_MS = 45000;
const RETRYABLE_WIKI_STREAM_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const interruptedWikiStreamError = (message = 'The build was interrupted partway. Noeis will resume it from saved evidence.') => {
  const error = new Error(message);
  error.code = 'WIKI_DRAFT_STREAM_INTERRUPTED';
  error.retryable = true;
  return error;
};

const streamMaintainWikiPageOnce = async (id, options = {}, handlers = {}) => {
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
  let res;
  try {
    res = await fetch(apiUrl(`${WIKI_PAGES_PATH}/${safeId(pageId)}/ai/draft/stream`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(options || {}),
      signal: controller.signal
    });
  } catch (error) {
    clearReadTimeout();
    if (controller.signal.aborted) {
      const timeoutError = interruptedWikiStreamError();
      timeoutError.code = 'WIKI_DRAFT_STREAM_TIMEOUT';
      throw timeoutError;
    }
    throw interruptedWikiStreamError(error?.message || undefined);
  }

  if (!res.ok) {
    let message = 'Failed to maintain wiki page.';
    let code = '';
    try {
      const body = await res.json();
      message = body?.error || message;
      code = body?.code || '';
    } catch (_error) {
      // Preserve the generic error if the stream endpoint did not return JSON.
    }
    const error = new Error(message);
    error.code = code;
    error.status = res.status;
    error.retryable = RETRYABLE_WIKI_STREAM_STATUSES.has(res.status);
    throw error;
  }

  if (!res.body?.getReader) {
    const body = await res.json();
    handlers.onPage?.(body);
    throw interruptedWikiStreamError('The dossier endpoint closed without a completion receipt. Noeis will resume it.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPage = null;
  let streamError = null;
  let finalDone = null;

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
      streamError.code = payload.code || 'WIKI_DRAFT_STREAM_FAILED';
      streamError.retryable = payload.retryable !== false;
    }
    if (event === 'done') {
      finalDone = payload;
      handlers.onDone?.(payload);
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
      const timeoutError = interruptedWikiStreamError();
      timeoutError.code = 'WIKI_DRAFT_STREAM_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearReadTimeout();
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeBlock(buffer);
  if (streamError) throw streamError;
  if (!finalDone) {
    throw interruptedWikiStreamError('The build stream closed before Noeis recorded completion. Resuming from saved evidence.');
  }
  if (finalDone?.ok === false) {
    const code = finalDone.code || 'WIKI_CANDIDATE_REJECTED';
    const evidenceIncomplete = code === 'WIKI_DOSSIER_EVIDENCE_INCOMPLETE';
    const reason = evidenceIncomplete
      ? finalPage?.aiState?.lastError
        || finalDone?.evidenceCoverage?.message
        || 'The saved evidence pack is incomplete.'
      : finalPage?.aiState?.lastCandidateSummary
        || finalPage?.aiState?.lastError
        || 'Not enough filing evidence was incorporated.';
    const rejected = new Error(evidenceIncomplete
      ? `This dossier needs more evidence — ${reason}`
      : `This dossier did not reach the evidence bar — ${reason} Rebuild, or discard the draft.`);
    rejected.code = code;
    rejected.retryable = false;
    rejected.page = finalPage;
    rejected.evidenceCoverage = finalDone.evidenceCoverage || null;
    throw rejected;
  }
  handlers.onComplete?.({ page: finalPage, done: finalDone });
  return finalPage;
};

const waitForWikiRetry = ms => new Promise(resolve => window.setTimeout(resolve, ms));

export const streamMaintainWikiPage = async (id, options = {}, handlers = {}) => {
  const retryDelaysMs = [5000, 20000, 45000];
  let lastError = null;
  for (let attempt = 1; attempt <= retryDelaysMs.length + 1; attempt += 1) {
    try {
      if (attempt > 1) {
        handlers.onEvent?.('wiki-draft', {
          stage: 'resuming',
          summary: `Resuming the interrupted build automatically (${attempt}/${retryDelaysMs.length + 1}).`,
          attempt
        });
      }
      return await streamMaintainWikiPageOnce(id, options, handlers);
    } catch (error) {
      lastError = error;
      if (error?.retryable !== true || attempt > retryDelaysMs.length) break;
      await waitForWikiRetry(retryDelaysMs[attempt - 1]);
    }
  }
  throw lastError;
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

export const getWikiBriefing = async ({ windowDays } = {}) => {
  const boundedDays = Number.isFinite(Number(windowDays))
    ? Math.max(1, Math.min(Math.floor(Number(windowDays)), 7))
    : null;
  const query = boundedDays ? `?windowDays=${boundedDays}` : '';
  const res = await api.get(`/api/wiki/briefing${query}`, getAuthHeaders());
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

/* Evergreen: the reader keeping something for life. Only the reader can set
   it, so this is a plain page update with one field. */
export const setWikiPageEvergreen = async (pageId, evergreen) => {
  const res = await api.patch(`${WIKI_PAGES_PATH}/${pageId}`, { evergreen: Boolean(evergreen) }, getAuthHeaders());
  return res.data;
};

/* What the library already holds about the claim on a judgment page. The
   answer is candidates, not lines: nothing is written until the reader files
   one under Why or Against. */
export const getJudgmentLibraryEvidence = async (pageId, params = {}) => {
  const res = await api.get(
    `${WIKI_PAGES_PATH}/${pageId}/library-evidence${buildQueryString(params)}`,
    getAuthHeaders()
  );
  return {
    claim: String(res.data?.claim || ''),
    terms: Array.isArray(res.data?.terms) ? res.data.terms : [],
    candidates: Array.isArray(res.data?.candidates) ? res.data.candidates : []
  };
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
  createCompanyDossier,
  refreshInvestmentValuation,
  getWikiFirstHeadCandidate,
  getPendingWikiClaimReview,
  reviewWikiFirstHeadCandidate,
  getWikiPage,
  getPublicWikiPage,
  getWikiPublicPreview,
  followPublicCasebook,
  unfollowPublicCasebook,
  forkPublicCasebook,
  exportPublicCasebook,
  verifyPublicCasebook,
  getPublicWikiComparison,
  getWikiRepoComparison,
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
  createWeekendReadingsDraft,
  getWeekendReadingsStatus,
  requestWeekendReadingsReview,
  approveWeekendReadingsRevision,
  publishWeekendReadingsRevision,
  saveInitialWikiJudgment,
  restoreInitialWikiJudgment,
  archiveWikiPage,
  deleteWikiPage,
  maintainWikiPage,
  draftWikiPage,
  startWikiPageBuild,
  getWikiPageBuildStatus,
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
  getJudgmentLibraryEvidence,
  setWikiPageEvergreen,
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

/* One claim on one page, as a file. The endpoint is behind the sign-in, so
   this is a request carrying the token rather than a link the browser follows
   on its own — a bare href would come back as the login page saved as a PDF. */
export const downloadJudgmentPamphlet = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}/pamphlet.pdf`, {
    ...getAuthHeaders(),
    responseType: 'blob'
  });
  return res.data;
};

/* Every claim in the wiki that something in the library argues with. */
export const listWikiContradictions = async ({ limit = 50 } = {}) => {
  const res = await api.get(`/api/wiki/contradictions?limit=${encodeURIComponent(limit)}`, getAuthHeaders());
  return Array.isArray(res.data?.contradictions) ? res.data.contradictions : [];
};
