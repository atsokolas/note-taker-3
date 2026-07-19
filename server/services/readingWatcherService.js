const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { createWikiSourceEvent } = require('./wikiSourceEventService');

const MAX_FEED_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
const DEFAULT_READING_WATCH_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const clean = (value = '', limit = 2000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};

const decodeEntities = (value = '') => String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code) || 32));

const normalizeFeedText = (value = '', limit = 12000) => clean(
  decodeEntities(value)
    .replace(/<(script|style|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1'),
  limit
);

const isPrivateIpv4 = (address = '') => {
  const octets = String(address).split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
};

const isPrivateAddress = (address = '') => {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family !== 6) return true;
  const normalized = String(address).toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
};

const validateFeedUrl = async (value, { lookup = dns.lookup } = {}) => {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch (_error) {
    const error = new Error('Reading watch requires a valid RSS or Atom URL.');
    error.statusCode = 400;
    throw error;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    const error = new Error('Reading watch URLs must use public HTTP(S) without embedded credentials.');
    error.statusCode = 400;
    throw error;
  }
  if ((parsed.port && parsed.protocol === 'http:' && parsed.port !== '80')
    || (parsed.port && parsed.protocol === 'https:' && parsed.port !== '443')) {
    const error = new Error('Reading watch URLs must use the standard HTTP(S) port.');
    error.statusCode = 400;
    throw error;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    const error = new Error('Reading watch URLs must resolve to a public host.');
    error.statusCode = 400;
    throw error;
  }
  const literalFamily = net.isIP(host);
  const addresses = literalFamily ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(row => isPrivateAddress(row.address))) {
    const error = new Error('Reading watch URLs must resolve only to public IP addresses.');
    error.statusCode = 400;
    throw error;
  }
  parsed.hash = '';
  return parsed.toString();
};

const readBoundedBody = async (response, maxBytes = MAX_FEED_BYTES) => {
  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (declared > maxBytes) throw new Error('Reading feed payload exceeds the size limit.');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error('Reading feed payload exceeds the size limit.');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => null);
      throw new Error('Reading feed payload exceeds the size limit.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const fetchFeedXml = async ({ feedUrl, fetchImpl = global.fetch, lookup = dns.lookup } = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available for reading watches.');
  let current = await validateFeedUrl(feedUrl, { lookup });
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(current, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
        'User-Agent': 'Noeis reading watcher (+https://www.noeis.io)'
      }
      });
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response?.status)) {
      const location = response.headers?.get?.('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error('Reading feed exceeded the redirect limit.');
      current = await validateFeedUrl(new URL(location, current).toString(), { lookup });
      continue;
    }
    if (!response?.ok) throw new Error(`Reading feed request failed with HTTP ${response?.status || 'unknown'}.`);
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (contentType && !/(xml|rss|atom|text\/plain|application\/octet-stream)/.test(contentType)) {
      throw new Error('Reading watch URL did not return an RSS or Atom payload.');
    }
    const xml = await readBoundedBody(response);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Reading feed contains unsupported document declarations.');
    if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error('Reading watch URL did not return RSS or Atom XML.');
    return { xml, canonicalFeedUrl: current };
  }
  throw new Error('Reading feed could not be fetched.');
};

const tagValue = (block, names = []) => {
  for (const name of names) {
    const match = String(block || '').match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return decodeEntities(match[1]).trim();
  }
  return '';
};

const linkValue = (block = '') => {
  const atom = String(block).match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
  return decodeEntities(atom?.[1] || tagValue(block, ['link'])).trim();
};

const canonicalizeItemUrl = (value = '', feedUrl = '') => {
  try {
    const url = new URL(value, feedUrl);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(key => url.searchParams.delete(key));
    url.searchParams.sort();
    return url.toString();
  } catch (_error) {
    return '';
  }
};

const parseFeedItems = ({ xml = '', feedUrl = '' } = {}) => {
  const itemBlocks = String(xml).match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  return itemBlocks.map((block) => {
    const url = canonicalizeItemUrl(linkValue(block), feedUrl);
    const guid = clean(tagValue(block, ['guid', 'id']), 1000);
    const title = normalizeFeedText(tagValue(block, ['title']), 300) || 'Untitled feed item';
    const summary = normalizeFeedText(tagValue(block, ['content:encoded', 'content', 'summary', 'description']), 12000);
    const publishedAt = tagValue(block, ['pubDate', 'published', 'updated', 'dc:date']);
    const identity = guid || url || `${title}:${publishedAt}`;
    return { identity, title, url, summary, publishedAt };
  }).filter(item => item.identity && item.title).slice(0, 40);
};

const readingExternalId = ({ canonicalFeedUrl, identity }) => `reading:${crypto.createHash('sha256').update(`${canonicalFeedUrl}\n${identity}`).digest('hex')}`;

const createReadingEvents = async ({ WikiSourceEvent, page, watch, items = [] } = {}) => {
  const created = [];
  for (const item of items) {
    const externalId = readingExternalId({ canonicalFeedUrl: watch.canonicalFeedUrl || watch.feedUrl, identity: item.identity });
    const existing = await WikiSourceEvent.findOne({
      userId: page.userId,
      provider: 'reading-feed',
      externalId,
      affectedPageIds: page._id
    }).select('_id').lean();
    if (existing) continue;
    const event = await createWikiSourceEvent({
      WikiSourceEvent,
      userId: page.userId,
      sourceType: 'external',
      provider: 'reading-feed',
      externalId,
      eventType: 'synced',
      title: clean(item.title, 300),
      summary: clean(item.summary || `New item from ${watch.label || watch.canonicalFeedUrl}.`, 1200),
      text: normalizeFeedText(`${item.title}\n${item.summary}`, 12000),
      url: item.url,
      sourceUpdatedAt: item.publishedAt || null,
      affectedPageIds: [page._id],
      metadata: {
        source: 'reading',
        pageId: String(page._id),
        feedUrl: watch.canonicalFeedUrl || watch.feedUrl,
        itemId: item.identity
      }
    });
    if (event) created.push(event);
  }
  return created;
};

const checkReadingWatchForPage = async ({ WikiSourceEvent, page, fetchImpl = global.fetch, lookup = dns.lookup, now = () => new Date() } = {}) => {
  if (!page) {
    const error = new Error('Wiki page is required for reading watch.');
    error.statusCode = 404;
    throw error;
  }
  const watch = page.externalWatches?.reading || {};
  if (!watch.feedUrl) {
    const error = new Error('Reading watch is not configured for this page.');
    error.statusCode = 400;
    throw error;
  }
  try {
    const fetched = await fetchFeedXml({ feedUrl: watch.feedUrl, fetchImpl, lookup });
    const items = parseFeedItems({ xml: fetched.xml, feedUrl: fetched.canonicalFeedUrl });
    const previousId = String(watch.lastItemId || '');
    const candidates = previousId
      ? items.slice(0, Math.max(0, items.findIndex(item => item.identity === previousId) === -1 ? 1 : items.findIndex(item => item.identity === previousId)))
      : items.slice(0, 1);
    const events = await createReadingEvents({
      WikiSourceEvent,
      page,
      watch: { ...watch, canonicalFeedUrl: fetched.canonicalFeedUrl },
      items: candidates
    });
    const latest = items[0] || null;
    page.externalWatches = page.externalWatches || {};
    page.externalWatches.reading = {
      ...watch,
      canonicalFeedUrl: fetched.canonicalFeedUrl,
      status: 'active',
      lastCheckedAt: now(),
      lastItemAt: latest?.publishedAt || watch.lastItemAt || null,
      lastItemId: latest?.identity || watch.lastItemId || '',
      lastItemTitle: latest?.title || watch.lastItemTitle || '',
      lastEventIds: [...(watch.lastEventIds || []), ...events.map(event => event._id)].slice(-20),
      errorMessage: ''
    };
    await page.save();
    return { page, events, items: candidates };
  } catch (error) {
    page.externalWatches = page.externalWatches || {};
    page.externalWatches.reading = { ...watch, status: 'error', lastCheckedAt: now(), errorMessage: clean(error.message, 500) };
    await page.save();
    error.statusCode = error.statusCode || 502;
    throw error;
  }
};

const armReadingWatchForPage = async ({ WikiSourceEvent, page, feedUrl, label = '', fetchImpl = global.fetch, lookup = dns.lookup } = {}) => {
  const canonicalFeedUrl = await validateFeedUrl(feedUrl, { lookup });
  page.externalWatches = page.externalWatches || {};
  const priorWatch = page.externalWatches.reading || {};
  const feedChanged = Boolean(priorWatch.canonicalFeedUrl || priorWatch.feedUrl)
    && String(priorWatch.canonicalFeedUrl || priorWatch.feedUrl) !== canonicalFeedUrl;
  page.externalWatches.reading = {
    ...priorWatch,
    feedUrl: canonicalFeedUrl,
    canonicalFeedUrl,
    label: clean(label || new URL(canonicalFeedUrl).hostname, 160),
    status: 'active',
    ...(feedChanged ? {
      lastItemId: '',
      lastItemTitle: '',
      lastItemAt: null,
      lastEventIds: []
    } : {}),
    errorMessage: ''
  };
  await page.save();
  return checkReadingWatchForPage({ WikiSourceEvent, page, fetchImpl, lookup });
};

const drainDueReadingWatches = async ({ models = {}, limit = 10, maxAgeMs = DEFAULT_READING_WATCH_MAX_AGE_MS, now = new Date(), fetchImpl = global.fetch, lookup = dns.lookup } = {}) => {
  const { WikiPage, WikiSourceEvent } = models;
  if (!WikiPage || !WikiSourceEvent) return { processed: 0, failed: 0, skipped: true, results: [] };
  const cutoff = new Date(now.getTime() - Math.max(15 * 60 * 1000, Number(maxAgeMs) || DEFAULT_READING_WATCH_MAX_AGE_MS));
  const pages = await WikiPage.find({
    'externalWatches.reading.status': 'active',
    $or: [
      { 'externalWatches.reading.lastCheckedAt': null },
      { 'externalWatches.reading.lastCheckedAt': { $exists: false } },
      { 'externalWatches.reading.lastCheckedAt': { $lte: cutoff } }
    ]
  }).sort({ 'externalWatches.reading.lastCheckedAt': 1 }).limit(Math.max(1, Math.min(Number(limit) || 10, 50)));
  const results = [];
  let failed = 0;
  for (const page of pages) {
    try {
      const result = await checkReadingWatchForPage({ WikiSourceEvent, page, fetchImpl, lookup, now: () => now });
      results.push({ pageId: String(page._id), status: 'completed', sourceEvents: result.events.length });
    } catch (error) {
      failed += 1;
      results.push({ pageId: String(page._id), status: 'failed', error: clean(error.message, 300) });
    }
  }
  return { processed: results.length - failed, failed, results };
};

module.exports = {
  armReadingWatchForPage,
  checkReadingWatchForPage,
  drainDueReadingWatches,
  fetchFeedXml,
  parseFeedItems,
  validateFeedUrl,
  normalizeFeedText,
  canonicalizeItemUrl,
  __testables: { isPrivateAddress, readBoundedBody, readingExternalId }
};
