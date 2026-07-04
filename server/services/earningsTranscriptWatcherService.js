const { createWikiSourceEvent } = require('./wikiSourceEventService');

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const DEFAULT_TRANSCRIPT_WATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const trim = (value = '', limit = 1000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
};

const normalizeTicker = (value = '') => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9.-]/g, '')
  .slice(0, 16);

const fmpApiKey = () => trim(process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || '', 240);

const transcriptWatchEnabled = () => Boolean(fmpApiKey());

const withFmpKey = (url, apiKey = fmpApiKey()) => {
  if (!apiKey) {
    const error = new Error('FMP_API_KEY is required for earnings transcript sync.');
    error.statusCode = 503;
    throw error;
  }
  const next = new URL(url);
  next.searchParams.set('apikey', apiKey);
  return next.toString();
};

const fetchJson = async ({ url, fetchImpl = global.fetch, apiKey = fmpApiKey() } = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available for transcript requests.');
  const response = await fetchImpl(withFmpKey(url, apiKey), { headers: { Accept: 'application/json' } });
  if (!response?.ok) {
    const error = new Error(`FMP transcript request failed with HTTP ${response?.status || 'unknown'}.`);
    error.statusCode = response?.status || 500;
    throw error;
  }
  return response.json();
};

const normalizeTranscriptMeta = (row = {}) => {
  const symbol = normalizeTicker(row.symbol || row.ticker);
  const year = Number(row.year || row.fiscalYear || 0);
  const quarter = Number(row.quarter || row.fiscalQuarter || 0);
  const date = trim(row.date || row.publishedDate || row.updatedAt || '', 80);
  return {
    symbol,
    year,
    quarter,
    date,
    title: trim(row.title || `${symbol} Q${quarter || '?'} ${year || ''} earnings call transcript`, 240),
    transcript: trim(row.transcript || row.content || row.text || '', 30000)
  };
};

const transcriptKey = ({ symbol = '', year = '', quarter = '', date = '' } = {}) => [
  normalizeTicker(symbol),
  year || 'unknown-year',
  quarter || 'unknown-quarter',
  date || ''
].join(':');

const fetchLatestTranscriptMeta = async ({ ticker, fetchImpl = global.fetch, apiKey = fmpApiKey() } = {}) => {
  const symbol = normalizeTicker(ticker);
  if (!symbol) {
    const error = new Error('Transcript watch requires a ticker.');
    error.statusCode = 400;
    throw error;
  }
  const payload = await fetchJson({
    url: `${FMP_BASE_URL}/earning-call-transcript-latest?symbol=${encodeURIComponent(symbol)}`,
    fetchImpl,
    apiKey
  });
  const rows = Array.isArray(payload) ? payload : Object.values(payload || {});
  const direct = rows
    .map(normalizeTranscriptMeta)
    .find(row => row.symbol === symbol && (row.year || row.quarter || row.transcript));
  if (direct) return direct;
  const fallback = rows.map(normalizeTranscriptMeta).find(row => row.symbol === symbol);
  if (fallback) return fallback;
  const error = new Error(`No earnings transcript found for ${symbol}.`);
  error.statusCode = 404;
  throw error;
};

const fetchTranscriptDetail = async ({
  ticker,
  year,
  quarter,
  fallback = {},
  fetchImpl = global.fetch,
  apiKey = fmpApiKey()
} = {}) => {
  const symbol = normalizeTicker(ticker || fallback.symbol);
  const safeYear = Number(year || fallback.year || 0);
  const safeQuarter = Number(quarter || fallback.quarter || 0);
  if (!symbol || !safeYear || !safeQuarter) return normalizeTranscriptMeta({ ...fallback, symbol });
  const payload = await fetchJson({
    url: `${FMP_BASE_URL}/earning-call-transcript?symbol=${encodeURIComponent(symbol)}&year=${safeYear}&quarter=${safeQuarter}`,
    fetchImpl,
    apiKey
  });
  const rows = Array.isArray(payload) ? payload : Object.values(payload || {});
  const detail = rows.map(normalizeTranscriptMeta).find(row => row.symbol === symbol) || {};
  return normalizeTranscriptMeta({ ...fallback, ...detail, symbol, year: safeYear, quarter: safeQuarter });
};

const transcriptSummary = (transcript = {}) => {
  const quarter = transcript.quarter ? `Q${transcript.quarter}` : 'latest';
  const year = transcript.year || 'earnings';
  const date = transcript.date ? ` on ${transcript.date}` : '';
  return trim(`${transcript.symbol} ${quarter} ${year} earnings call transcript${date}. Management commentary is queued as source material for this dossier.`, 1200);
};

const buildTranscriptEventPayload = ({ userId, page, transcript } = {}) => {
  const key = transcriptKey(transcript);
  const summary = transcriptSummary(transcript);
  const transcriptText = trim(transcript.transcript, 7800);
  return {
    userId,
    sourceType: 'external',
    provider: 'fmp-transcripts',
    externalId: `fmp-transcript:${key}`,
    eventType: 'synced',
    title: trim(`${transcript.symbol} earnings call transcript${transcript.quarter ? ` Q${transcript.quarter}` : ''}${transcript.year ? ` ${transcript.year}` : ''}`, 240),
    summary,
    text: [summary, transcriptText].filter(Boolean).join('\n\n'),
    url: '',
    sourceUpdatedAt: transcript.date || null,
    affectedPageIds: [page?._id].filter(Boolean),
    metadata: {
      source: 'fmp-transcripts',
      provider: 'fmp',
      ticker: transcript.symbol,
      year: transcript.year || null,
      quarter: transcript.quarter || null,
      date: transcript.date || '',
      pageId: String(page?._id || ''),
      transcriptKey: key,
      hasTranscriptText: Boolean(transcriptText)
    }
  };
};

const createMissingTranscriptEvent = async ({ WikiSourceEvent, userId, page, transcript } = {}) => {
  if (!WikiSourceEvent || !userId || !page || !transcript?.symbol) return null;
  const payload = buildTranscriptEventPayload({ userId, page, transcript });
  const existing = await WikiSourceEvent.findOne({
    userId,
    provider: payload.provider,
    externalId: payload.externalId
  }).select('_id').lean();
  if (existing) return null;
  return createWikiSourceEvent({ WikiSourceEvent, ...payload });
};

const setTranscriptWatch = ({ page, patch = {} } = {}) => {
  page.externalWatches = {
    ...(page.externalWatches?.toObject ? page.externalWatches.toObject() : page.externalWatches || {}),
    transcripts: {
      ...((page.externalWatches?.transcripts?.toObject ? page.externalWatches.transcripts.toObject() : page.externalWatches?.transcripts) || {}),
      ...patch
    }
  };
  if (typeof page.markModified === 'function') page.markModified('externalWatches');
};

const checkTranscriptWatchForPage = async ({
  WikiSourceEvent,
  page,
  fetchImpl = global.fetch,
  apiKey = fmpApiKey(),
  now = () => new Date()
} = {}) => {
  if (!page) {
    const error = new Error('Wiki page is required for transcript watch.');
    error.statusCode = 404;
    throw error;
  }
  const watch = page.externalWatches?.transcripts || {};
  const ticker = normalizeTicker(watch.ticker);
  if (!ticker) {
    const error = new Error('This page does not have a transcript ticker configured.');
    error.statusCode = 400;
    throw error;
  }
  try {
    const latest = await fetchLatestTranscriptMeta({ ticker, fetchImpl, apiKey });
    const transcript = await fetchTranscriptDetail({ ticker, fallback: latest, fetchImpl, apiKey });
    const event = await createMissingTranscriptEvent({ WikiSourceEvent, userId: page.userId, page, transcript });
    setTranscriptWatch({
      page,
      patch: {
        provider: 'fmp',
        ticker,
        status: 'active',
        lastCheckedAt: now(),
        lastTranscriptAt: transcript.date ? new Date(transcript.date) : watch.lastTranscriptAt || null,
        lastTranscriptKey: transcriptKey(transcript),
        lastEventIds: event?._id ? [event._id] : [],
        errorMessage: ''
      }
    });
    if (typeof page.save === 'function') await page.save();
    return { page, transcript, events: event ? [event] : [] };
  } catch (error) {
    setTranscriptWatch({
      page,
      patch: {
        provider: 'fmp',
        ticker,
        status: 'error',
        lastCheckedAt: now(),
        errorMessage: error.message || 'Transcript watch failed.'
      }
    });
    if (typeof page.save === 'function') await page.save();
    throw error;
  }
};

const armTranscriptWatchForPage = async ({
  WikiPage,
  WikiSourceEvent,
  userId,
  pageId,
  ticker = '',
  fetchImpl = global.fetch,
  apiKey = fmpApiKey(),
  now = () => new Date(),
  checkNow = true
} = {}) => {
  if (!WikiPage || !userId || !pageId) {
    const error = new Error('WikiPage, userId, and pageId are required to arm transcript watch.');
    error.statusCode = 400;
    throw error;
  }
  const symbol = normalizeTicker(ticker);
  if (!symbol) {
    const error = new Error('ticker is required.');
    error.statusCode = 400;
    throw error;
  }
  const page = await WikiPage.findOne({ _id: pageId, userId, status: { $ne: 'archived' } });
  if (!page) {
    const error = new Error('Wiki page not found.');
    error.statusCode = 404;
    throw error;
  }
  setTranscriptWatch({
    page,
    patch: {
      provider: 'fmp',
      ticker: symbol,
      status: 'active',
      lastCheckedAt: null,
      lastTranscriptAt: null,
      lastTranscriptKey: '',
      lastEventIds: [],
      errorMessage: ''
    }
  });
  if (typeof page.save === 'function') await page.save();
  if (!checkNow) return { page, transcript: null, events: [] };
  return checkTranscriptWatchForPage({ WikiSourceEvent, page, fetchImpl, apiKey, now });
};

const dueTranscriptWatchQuery = ({ cutoff = new Date(Date.now() - DEFAULT_TRANSCRIPT_WATCH_MAX_AGE_MS) } = {}) => ({
  status: { $ne: 'archived' },
  'externalWatches.transcripts.status': 'active',
  'externalWatches.transcripts.ticker': { $nin: ['', null] },
  $or: [
    { 'externalWatches.transcripts.lastCheckedAt': null },
    { 'externalWatches.transcripts.lastCheckedAt': { $exists: false } },
    { 'externalWatches.transcripts.lastCheckedAt': { $lte: cutoff } }
  ]
});

const drainDueTranscriptWatches = async ({
  models = {},
  limit = 5,
  maxAgeMs = DEFAULT_TRANSCRIPT_WATCH_MAX_AGE_MS,
  fetchImpl = global.fetch,
  apiKey = fmpApiKey(),
  checkTranscriptWatchForPageFn = checkTranscriptWatchForPage,
  now = new Date()
} = {}) => {
  const { WikiPage, WikiSourceEvent } = models;
  if (!WikiPage || !WikiSourceEvent) return { processed: 0, failed: 0, skipped: true, results: [] };
  if (!apiKey) return { processed: 0, failed: 0, skipped: true, reason: 'missing_fmp_api_key', results: [] };
  const max = Math.max(1, Math.min(Number(limit) || 5, 25));
  const cutoff = new Date(now.getTime() - Math.max(60 * 60 * 1000, Number(maxAgeMs) || DEFAULT_TRANSCRIPT_WATCH_MAX_AGE_MS));
  const pages = await WikiPage.find(dueTranscriptWatchQuery({ cutoff }))
    .sort({ 'externalWatches.transcripts.lastCheckedAt': 1, updatedAt: 1 })
    .limit(max);
  const results = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    try {
      const result = await checkTranscriptWatchForPageFn({
        WikiSourceEvent,
        page,
        fetchImpl,
        apiKey,
        now: () => now
      });
      results.push({
        pageId: String(page._id || ''),
        ticker: normalizeTicker(page.externalWatches?.transcripts?.ticker),
        status: 'completed',
        transcriptKey: result.transcript ? transcriptKey(result.transcript) : '',
        sourceEvents: Array.isArray(result.events) ? result.events.length : 0
      });
    } catch (error) {
      results.push({
        pageId: String(page._id || ''),
        ticker: normalizeTicker(page.externalWatches?.transcripts?.ticker),
        status: 'failed',
        error: error.message || String(error)
      });
    }
  }
  return {
    processed: results.filter(result => result.status === 'completed').length,
    failed: results.filter(result => result.status === 'failed').length,
    results
  };
};

module.exports = {
  DEFAULT_TRANSCRIPT_WATCH_MAX_AGE_MS,
  armTranscriptWatchForPage,
  buildTranscriptEventPayload,
  checkTranscriptWatchForPage,
  drainDueTranscriptWatches,
  dueTranscriptWatchQuery,
  fetchLatestTranscriptMeta,
  fetchTranscriptDetail,
  fmpApiKey,
  normalizeTicker,
  normalizeTranscriptMeta,
  transcriptKey,
  transcriptWatchEnabled
};
