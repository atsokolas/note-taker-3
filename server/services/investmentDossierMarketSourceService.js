const crypto = require('crypto');

const NASDAQ_QUOTE_API_BASE = 'https://api.nasdaq.com/api/quote';
const NASDAQ_MARKET_PAGE_BASE = 'https://www.nasdaq.com/market-activity/stocks';
const MAX_QUOTE_AGE_DAYS = 7;

const clean = (value = '', max = 1200) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const normalizeTicker = value => clean(value, 20)
  .toUpperCase()
  .replace(/[^A-Z0-9.-]/g, '');

const parsePrice = value => {
  const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseNasdaqDate = (value = '') => {
  const match = clean(value, 80).match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/i
  );
  if (!match) return null;
  const months = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11
  };
  const date = new Date(Date.UTC(
    Number(match[3]),
    months[match[1].toLowerCase()],
    Number(match[2])
  ));
  return Number.isNaN(date.getTime()) ? null : date;
};

const quoteAgeDays = ({ asOf, now = new Date() } = {}) => (
  Math.floor((new Date(now).getTime() - new Date(asOf).getTime()) / (24 * 60 * 60 * 1000))
);

const assessNasdaqQuote = ({
  payload = {},
  ticker = '',
  now = new Date()
} = {}) => {
  const data = payload?.data || {};
  const primary = data?.primaryData || {};
  const normalizedTicker = normalizeTicker(ticker);
  const returnedTicker = normalizeTicker(data.symbol);
  const price = parsePrice(primary.lastSalePrice);
  const asOf = parseNasdaqDate(primary.lastTradeTimestamp);
  const ageDays = asOf ? quoteAgeDays({ asOf, now }) : null;
  const accepted = Boolean(
    normalizedTicker
    && returnedTicker === normalizedTicker
    && clean(data.assetClass, 40).toUpperCase() === 'STOCKS'
    && clean(data.exchange, 80)
    && price
    && asOf
    && ageDays >= 0
    && ageDays <= MAX_QUOTE_AGE_DAYS
  );
  return {
    accepted,
    ticker: returnedTicker,
    companyName: clean(data.companyName, 240),
    exchange: clean(data.exchange, 80),
    price,
    asOf,
    ageDays,
    isRealTime: primary.isRealTime === true,
    marketStatus: clean(data.marketStatus, 80),
    rawTimestamp: clean(primary.lastTradeTimestamp, 80),
    reasons: accepted
      ? []
      : ['The public quote did not provide an exact ticker match, positive price, exchange, and recent dated trade.']
  };
};

const fetchNasdaqQuote = async ({
  ticker = '',
  fetchImpl = global.fetch,
  timeoutMs = 10000
} = {}) => {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) throw new Error('ticker is required.');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const endpoint = `${NASDAQ_QUOTE_API_BASE}/${encodeURIComponent(normalizedTicker)}/info?assetclass=stocks`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Origin: 'https://www.nasdaq.com',
        Referer: 'https://www.nasdaq.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36'
      }
    });
    if (!response.ok) {
      const error = new Error(`Nasdaq public quote returned HTTP ${response.status}.`);
      error.statusCode = response.status;
      throw error;
    }
    return {
      endpoint,
      payload: await response.json()
    };
  } finally {
    clearTimeout(timer);
  }
};

const sourceRefFromNasdaqQuote = ({
  assessment = {},
  endpoint = '',
  now = new Date()
} = {}) => {
  const ticker = normalizeTicker(assessment.ticker);
  const asOf = new Date(assessment.asOf).toISOString().slice(0, 10);
  const retrievedAt = new Date(now).toISOString();
  const publicUrl = `${NASDAQ_MARKET_PAGE_BASE}/${ticker.toLowerCase()}`;
  const snippet = [
    `Nasdaq reported a ${ticker} last-sale price of $${Number(assessment.price).toFixed(2)} dated ${asOf}.`,
    `Exchange: ${assessment.exchange}.`,
    `Nasdaq market status at retrieval: ${assessment.marketStatus || 'unavailable'}.`,
    assessment.isRealTime
      ? 'The public response marked the quote as real-time.'
      : 'The public response did not mark the quote as real-time.'
  ].join(' ');
  const contentHash = crypto.createHash('sha256').update(snippet).digest('hex');
  return {
    type: 'external',
    title: `${ticker} dated market-price snapshot`,
    snippet,
    url: publicUrl,
    citationLabel: `Nasdaq · ${asOf}`,
    provider: 'nasdaq-public-quote',
    metadata: {
      evidenceArchetype: 'market_snapshot',
      sourceClass: 'public_market_operator_quote',
      acquisitionMethod: 'nasdaq_public_quote',
      marketSnapshot: true,
      ticker,
      companyName: assessment.companyName,
      exchange: assessment.exchange,
      price: assessment.price,
      currency: 'USD',
      asOf,
      isRealTime: assessment.isRealTime,
      provenance: {
        retrievedAt,
        contentHash,
        originalUrl: publicUrl,
        apiEndpoint: endpoint,
        access: 'public_no_key'
      },
      validation: {
        status: 'accepted',
        exactTickerMatch: true,
        positivePrice: true,
        datedTrade: true,
        ageDays: assessment.ageDays,
        reasons: []
      }
    },
    addedBy: 'ai'
  };
};

const isTransientError = error => (
  error?.name === 'AbortError'
  || Number(error?.statusCode) === 408
  || Number(error?.statusCode) === 429
  || Number(error?.statusCode) >= 500
);

const acquireMarketSnapshotSource = async ({
  ticker = '',
  fetchImpl = global.fetch,
  fetchNasdaqQuoteFn = fetchNasdaqQuote,
  now = new Date()
} = {}) => {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) {
    return {
      sourceRef: null,
      stop: {
        code: 'MARKET_SNAPSHOT_TICKER_REQUIRED',
        evidenceArchetype: 'market_snapshot',
        message: 'A ticker is required before Noeis can attach a dated public market price.'
      }
    };
  }
  let result;
  try {
    result = await fetchNasdaqQuoteFn({
      ticker: normalizedTicker,
      fetchImpl
    });
  } catch (error) {
    if (isTransientError(error)) throw error;
    return {
      sourceRef: null,
      stop: {
        code: 'MARKET_SNAPSHOT_UNAVAILABLE',
        evidenceArchetype: 'market_snapshot',
        message: 'A dated public market price was not available for this ticker. Noeis left the expectations clock incomplete.'
      },
      diagnostic: clean(error?.message, 500)
    };
  }
  const assessment = assessNasdaqQuote({
    payload: result.payload,
    ticker: normalizedTicker,
    now
  });
  if (!assessment.accepted) {
    return {
      sourceRef: null,
      stop: {
        code: 'MARKET_SNAPSHOT_INSUFFICIENT',
        evidenceArchetype: 'market_snapshot',
        message: 'The public quote was missing an exact ticker match, positive price, exchange, or recent trade date. Noeis left the expectations clock incomplete.'
      },
      assessment
    };
  }
  return {
    sourceRef: sourceRefFromNasdaqQuote({
      assessment,
      endpoint: result.endpoint,
      now
    }),
    stop: null,
    assessment
  };
};

module.exports = {
  MAX_QUOTE_AGE_DAYS,
  NASDAQ_MARKET_PAGE_BASE,
  NASDAQ_QUOTE_API_BASE,
  acquireMarketSnapshotSource,
  assessNasdaqQuote,
  fetchNasdaqQuote,
  normalizeTicker,
  parseNasdaqDate,
  parsePrice,
  quoteAgeDays,
  sourceRefFromNasdaqQuote
};
