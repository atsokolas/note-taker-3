const { createWikiSourceEvent } = require('./wikiSourceEventService');
const { extractReadableText, normalizeIngestText } = require('./import/urlTextIngest');

const SEC_SUBMISSIONS_BASE_URL = 'https://data.sec.gov/submissions';
const SEC_COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const DEFAULT_EDGAR_FORMS = ['10-K', '10-Q', '8-K', '13F-HR'];
const DEFAULT_SEC_USER_AGENT = 'Noeis research maintenance contact@noeis.io';
const DEFAULT_EDGAR_WATCH_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const trim = (value = '', limit = 1000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
};

const normalizeTicker = (value = '') => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9.-]/g, '')
  .slice(0, 16);

const normalizeCik = (value = '') => String(value || '')
  .replace(/\D/g, '')
  .replace(/^0+/, '')
  .slice(0, 10);

const padCik = (value = '') => normalizeCik(value).padStart(10, '0');

const normalizeForms = (forms = DEFAULT_EDGAR_FORMS) => {
  const next = (Array.isArray(forms) ? forms : String(forms || '').split(','))
    .map(form => String(form || '').trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(next.length ? next : DEFAULT_EDGAR_FORMS)).slice(0, 20);
};

const secUserAgent = () => trim(process.env.SEC_USER_AGENT || process.env.EDGAR_USER_AGENT || DEFAULT_SEC_USER_AGENT, 240);

const secHeaders = (userAgent = secUserAgent()) => ({
  'User-Agent': userAgent,
  Accept: 'application/json'
});

const fetchJson = async ({ url, fetchImpl = global.fetch, userAgent = secUserAgent() } = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available for EDGAR requests.');
  const response = await fetchImpl(url, { headers: secHeaders(userAgent) });
  if (!response?.ok) {
    const error = new Error(`SEC EDGAR request failed with HTTP ${response?.status || 'unknown'}.`);
    error.statusCode = response?.status || 500;
    throw error;
  }
  return response.json();
};

const fetchFilingDocument = async ({ url, fetchImpl = global.fetch, userAgent = secUserAgent() } = {}) => {
  if (!url || typeof fetchImpl !== 'function') return '';
  const response = await fetchImpl(url, {
    headers: {
      ...secHeaders(userAgent),
      Accept: 'text/html, text/plain;q=0.9,*/*;q=0.5'
    }
  });
  if (!response?.ok) {
    const error = new Error(`SEC filing document request failed with HTTP ${response?.status || 'unknown'}.`);
    error.statusCode = response?.status || 500;
    throw error;
  }
  const raw = await response.text();
  const visibleDocument = String(raw || '')
    .replace(/<ix:header\b[\s\S]*?<\/ix:header>/gi, ' ')
    .replace(/<(?:div|span)\b[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^>]*>[\s\S]*?<\/(?:div|span)>/gi, ' ');
  return normalizeIngestText(extractReadableText(visibleDocument), 120000);
};

const resolveCompanyIdentifier = async ({
  ticker = '',
  cik = '',
  fetchImpl = global.fetch,
  userAgent = secUserAgent()
} = {}) => {
  const normalizedCik = normalizeCik(cik);
  const normalizedTicker = normalizeTicker(ticker);
  if (normalizedCik) {
    return { cik: normalizedCik, ticker: normalizedTicker, companyName: '' };
  }
  if (!normalizedTicker) {
    const error = new Error('EDGAR watch requires a ticker or CIK.');
    error.statusCode = 400;
    throw error;
  }
  const payload = await fetchJson({ url: SEC_COMPANY_TICKERS_URL, fetchImpl, userAgent });
  const rows = Array.isArray(payload) ? payload : Object.values(payload || {});
  const match = rows.find(row => normalizeTicker(row?.ticker) === normalizedTicker);
  if (!match?.cik_str) {
    const error = new Error(`No SEC CIK found for ticker ${normalizedTicker}.`);
    error.statusCode = 404;
    throw error;
  }
  return {
    cik: normalizeCik(match.cik_str),
    ticker: normalizedTicker,
    companyName: trim(match.title || match.name || '', 240)
  };
};

const buildFilingUrl = ({ cik, accessionNumber, primaryDocument } = {}) => {
  const normalizedCik = normalizeCik(cik);
  const accession = String(accessionNumber || '').replace(/-/g, '').trim();
  const documentName = String(primaryDocument || '').trim();
  if (!normalizedCik || !accession || !documentName) return '';
  return `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${accession}/${encodeURIComponent(documentName)}`;
};

const normalizeRecentFilings = (submissions = {}) => {
  const recent = submissions?.filings?.recent || {};
  const accessionNumbers = Array.isArray(recent.accessionNumber) ? recent.accessionNumber : [];
  return accessionNumbers.map((accessionNumber, index) => ({
    accessionNumber: trim(accessionNumber, 80),
    filingDate: trim(recent.filingDate?.[index], 40),
    reportDate: trim(recent.reportDate?.[index], 40),
    acceptanceDateTime: trim(recent.acceptanceDateTime?.[index], 80),
    act: trim(recent.act?.[index], 40),
    form: trim(recent.form?.[index], 40).toUpperCase(),
    fileNumber: trim(recent.fileNumber?.[index], 80),
    filmNumber: trim(recent.filmNumber?.[index], 80),
    items: trim(recent.items?.[index], 240),
    primaryDocument: trim(recent.primaryDocument?.[index], 240),
    primaryDocDescription: trim(recent.primaryDocDescription?.[index], 240),
    size: Number(recent.size?.[index] || 0)
  })).filter(filing => filing.accessionNumber && filing.form);
};

const latestTrackedFilings = ({ submissions, forms = DEFAULT_EDGAR_FORMS, limit = 8 } = {}) => {
  const allowedForms = new Set(normalizeForms(forms));
  return normalizeRecentFilings(submissions)
    .filter(filing => allowedForms.has(filing.form))
    .slice(0, Math.max(1, Math.min(Number(limit) || 8, 40)));
};

const filingExternalId = ({ cik, filing } = {}) => `sec-edgar:${padCik(cik)}:${String(filing?.accessionNumber || '').trim()}`;

const filingTitle = ({ ticker = '', companyName = '', filing } = {}) => {
  const label = normalizeTicker(ticker) || trim(companyName, 80) || 'Company';
  const date = filing?.filingDate ? ` filed ${filing.filingDate}` : ' filing';
  return trim(`${label} ${filing?.form || 'SEC'}${date}`, 240);
};

const filingSummary = ({ ticker = '', companyName = '', filing } = {}) => {
  const name = trim(companyName || normalizeTicker(ticker) || 'The company', 120);
  const details = [
    `${name} filed ${filing?.form || 'an SEC filing'}${filing?.filingDate ? ` on ${filing.filingDate}` : ''}.`,
    filing?.primaryDocDescription ? `Document: ${filing.primaryDocDescription}.` : '',
    filing?.items ? `Items: ${filing.items}.` : ''
  ].filter(Boolean).join(' ');
  return trim(details, 1200);
};

const buildFilingEventPayload = ({ userId, page, watch, filing, filingText = '' } = {}) => {
  const ticker = normalizeTicker(watch?.ticker);
  const cik = normalizeCik(watch?.cik);
  const companyName = trim(watch?.companyName || '', 240);
  const url = buildFilingUrl({ cik, accessionNumber: filing.accessionNumber, primaryDocument: filing.primaryDocument });
  return {
    userId,
    sourceType: 'external',
    provider: 'sec-edgar',
    externalId: filingExternalId({ cik, filing }),
    eventType: 'synced',
    title: filingTitle({ ticker, companyName, filing }),
    summary: filingSummary({ ticker, companyName, filing }),
    text: [
      filingSummary({ ticker, companyName, filing }),
      `Accession number: ${filing.accessionNumber}.`,
      filing.reportDate ? `Report date: ${filing.reportDate}.` : '',
      filing.primaryDocument ? `Primary document: ${filing.primaryDocument}.` : '',
      filingText
    ].filter(Boolean).join('\n'),
    url,
    sourceUpdatedAt: filing.filingDate || filing.acceptanceDateTime || null,
    affectedPageIds: [page?._id].filter(Boolean),
    metadata: {
      source: 'sec-edgar',
      ticker,
      cik: padCik(cik),
      companyName,
      form: filing.form,
      filingDate: filing.filingDate,
      reportDate: filing.reportDate,
      accessionNumber: filing.accessionNumber,
      primaryDocument: filing.primaryDocument,
      pageId: String(page?._id || ''),
      hasFilingText: Boolean(filingText),
      filingTextLength: filingText.length
    }
  };
};

const createMissingFilingEvents = async ({
  WikiSourceEvent,
  userId,
  page,
  watch,
  filings = [],
  fetchImpl = global.fetch,
  userAgent = secUserAgent()
} = {}) => {
  if (!WikiSourceEvent || !userId || !page || !watch) return [];
  const created = [];
  for (const filing of filings) {
    const externalId = filingExternalId({ cik: watch.cik, filing });
    const existing = await WikiSourceEvent.findOne({
      userId,
      provider: 'sec-edgar',
      externalId,
      affectedPageIds: page._id
    }).select('_id text metadata').lean();
    const url = buildFilingUrl({ cik: watch.cik, accessionNumber: filing.accessionNumber, primaryDocument: filing.primaryDocument });
    if (existing && String(existing.text || '').length >= 2000) continue;
    let filingText = '';
    let documentError = '';
    try {
      filingText = await fetchFilingDocument({ url, fetchImpl, userAgent });
    } catch (error) {
      documentError = trim(error?.message || 'Failed to fetch SEC filing document.', 500);
    }
    const payload = buildFilingEventPayload({ userId, page, watch, filing, filingText });
    if (documentError) payload.metadata.documentError = documentError;
    if (existing) {
      if (filingText && typeof WikiSourceEvent.findByIdAndUpdate === 'function') {
        await WikiSourceEvent.findByIdAndUpdate(existing._id, {
          $set: {
            text: payload.text,
            url: payload.url,
            sourceUpdatedAt: payload.sourceUpdatedAt,
            metadata: { ...(existing.metadata || {}), ...payload.metadata }
          }
        });
      }
      continue;
    }
    const event = await createWikiSourceEvent({
      WikiSourceEvent,
      ...payload
    });
    if (event) created.push(event);
  }
  return created;
};

const checkEdgarWatchForPage = async ({
  WikiSourceEvent,
  page,
  fetchImpl = global.fetch,
  userAgent = secUserAgent(),
  limit = 8,
  now = () => new Date()
} = {}) => {
  if (!page) {
    const error = new Error('Wiki page is required for EDGAR watch.');
    error.statusCode = 404;
    throw error;
  }
  const userId = page.userId;
  const watch = page.externalWatches?.edgar || {};
  const cik = normalizeCik(watch.cik);
  if (!cik) {
    const error = new Error('This page does not have an EDGAR CIK configured.');
    error.statusCode = 400;
    throw error;
  }
  try {
    const submissions = await fetchJson({
      url: `${SEC_SUBMISSIONS_BASE_URL}/CIK${padCik(cik)}.json`,
      fetchImpl,
      userAgent
    });
    const filings = latestTrackedFilings({ submissions, forms: watch.forms, limit });
    const events = await createMissingFilingEvents({ WikiSourceEvent, userId, page, watch, filings, fetchImpl, userAgent });
    const newest = filings[0] || null;
    page.externalWatches = {
      ...(page.externalWatches?.toObject ? page.externalWatches.toObject() : page.externalWatches || {}),
      edgar: {
        ...(watch?.toObject ? watch.toObject() : watch || {}),
        status: 'active',
        lastCheckedAt: now(),
        lastFilingAt: newest?.filingDate ? new Date(newest.filingDate) : watch.lastFilingAt || null,
        lastAccessionNumber: newest?.accessionNumber || watch.lastAccessionNumber || '',
        lastEventIds: events.map(event => event._id).filter(Boolean).slice(0, 20),
        errorMessage: ''
      }
    };
    if (typeof page.markModified === 'function') page.markModified('externalWatches');
    if (typeof page.save === 'function') await page.save();
    return { page, filings, events };
  } catch (error) {
    page.externalWatches = {
      ...(page.externalWatches?.toObject ? page.externalWatches.toObject() : page.externalWatches || {}),
      edgar: {
        ...(watch?.toObject ? watch.toObject() : watch || {}),
        status: 'error',
        lastCheckedAt: now(),
        errorMessage: error.message || 'EDGAR watch failed.'
      }
    };
    if (typeof page.markModified === 'function') page.markModified('externalWatches');
    if (typeof page.save === 'function') await page.save();
    throw error;
  }
};

const armEdgarWatchForPage = async ({
  WikiPage,
  WikiSourceEvent,
  userId,
  pageId,
  ticker = '',
  cik = '',
  companyName = '',
  forms = DEFAULT_EDGAR_FORMS,
  fetchImpl = global.fetch,
  userAgent = secUserAgent(),
  now = () => new Date(),
  checkNow = true
} = {}) => {
  if (!WikiPage || !userId || !pageId) {
    const error = new Error('WikiPage, userId, and pageId are required to arm EDGAR watch.');
    error.statusCode = 400;
    throw error;
  }
  const page = await WikiPage.findOne({ _id: pageId, userId, status: { $ne: 'archived' } });
  if (!page) {
    const error = new Error('Wiki page not found.');
    error.statusCode = 404;
    throw error;
  }
  const resolved = await resolveCompanyIdentifier({ ticker, cik, fetchImpl, userAgent });
  const watch = {
    ticker: normalizeTicker(resolved.ticker || ticker),
    cik: padCik(resolved.cik),
    companyName: trim(companyName || resolved.companyName, 240),
    forms: normalizeForms(forms),
    status: 'active',
    lastCheckedAt: null,
    lastFilingAt: null,
    lastAccessionNumber: '',
    lastEventIds: [],
    errorMessage: ''
  };
  page.externalWatches = {
    ...(page.externalWatches?.toObject ? page.externalWatches.toObject() : page.externalWatches || {}),
    edgar: watch
  };
  if (typeof page.markModified === 'function') page.markModified('externalWatches');
  if (typeof page.save === 'function') await page.save();
  if (!checkNow) return { page, filings: [], events: [] };
  return checkEdgarWatchForPage({ WikiSourceEvent, page, fetchImpl, userAgent, now });
};

const dueEdgarWatchQuery = ({ cutoff = new Date(Date.now() - DEFAULT_EDGAR_WATCH_MAX_AGE_MS) } = {}) => ({
  'createdFrom.label': { $not: /^weekend-readings:/ },
  status: { $ne: 'archived' },
  'externalWatches.edgar.status': 'active',
  'externalWatches.edgar.cik': { $nin: ['', null] },
  $or: [
    { 'externalWatches.edgar.lastCheckedAt': null },
    { 'externalWatches.edgar.lastCheckedAt': { $exists: false } },
    { 'externalWatches.edgar.lastCheckedAt': { $lte: cutoff } }
  ]
});

const drainDueEdgarWatches = async ({
  models = {},
  limit = 10,
  maxAgeMs = DEFAULT_EDGAR_WATCH_MAX_AGE_MS,
  fetchImpl = global.fetch,
  userAgent = secUserAgent(),
  checkEdgarWatchForPageFn = checkEdgarWatchForPage,
  now = new Date()
} = {}) => {
  const { WikiPage, WikiSourceEvent } = models;
  if (!WikiPage || !WikiSourceEvent) return { processed: 0, failed: 0, skipped: true, results: [] };
  const max = Math.max(1, Math.min(Number(limit) || 10, 50));
  const cutoff = new Date(now.getTime() - Math.max(15 * 60 * 1000, Number(maxAgeMs) || DEFAULT_EDGAR_WATCH_MAX_AGE_MS));
  const pages = await WikiPage.find(dueEdgarWatchQuery({ cutoff }))
    .sort({ 'externalWatches.edgar.lastCheckedAt': 1, updatedAt: 1 })
    .limit(max);
  const results = [];
  for (const page of (Array.isArray(pages) ? pages : []).filter(page => !String(page?.createdFrom?.label || '').startsWith('weekend-readings:'))) {
    try {
      const result = await checkEdgarWatchForPageFn({
        WikiSourceEvent,
        page,
        fetchImpl,
        userAgent,
        now: () => now
      });
      results.push({
        pageId: String(page._id || ''),
        ticker: normalizeTicker(page.externalWatches?.edgar?.ticker),
        cik: page.externalWatches?.edgar?.cik || '',
        status: 'completed',
        filings: Array.isArray(result.filings) ? result.filings.length : 0,
        sourceEvents: Array.isArray(result.events) ? result.events.length : 0
      });
    } catch (error) {
      results.push({
        pageId: String(page._id || ''),
        ticker: normalizeTicker(page.externalWatches?.edgar?.ticker),
        cik: page.externalWatches?.edgar?.cik || '',
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
  DEFAULT_EDGAR_FORMS,
  DEFAULT_EDGAR_WATCH_MAX_AGE_MS,
  buildFilingEventPayload,
  buildFilingUrl,
  checkEdgarWatchForPage,
  drainDueEdgarWatches,
  dueEdgarWatchQuery,
  filingExternalId,
  fetchFilingDocument,
  latestTrackedFilings,
  normalizeCik,
  normalizeForms,
  normalizeRecentFilings,
  normalizeTicker,
  padCik,
  resolveCompanyIdentifier,
  secUserAgent,
  armEdgarWatchForPage
};
