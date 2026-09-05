const crypto = require('crypto');
const {
  fetchPublicText,
  isPrivateAddress,
  validatePublicUrl
} = require('../lib/publicUrlFetch');
const { createWikiSourceEvent } = require('./wikiSourceEventService');

const MAX_FEED_BYTES = 1024 * 1024;
const DEFAULT_READING_WATCH_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const clean = (value = '', limit = 2000) => wordBoundaryTrim(String(value || '').replace(/\s+/g, ' ').trim(), { maxLength: limit });

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

/* The feed's own wording over the shared check. Every rule here — public
   hosts only, no credentials, standard ports, re-validated on each redirect —
   now lives in one place, because an article fetch needs exactly the same
   guarantees and a second copy would be a second thing to keep correct. */
const FEED_SUBJECT = 'Reading watch URL';

const validateFeedUrl = (value, { lookup } = {}) => validatePublicUrl(value, { lookup, subject: FEED_SUBJECT });

/* The caller needs the URL it finally landed on as well as the body: feed
   item links are resolved relative to it, and a feed that redirects would
   otherwise canonicalise its items against the address before the hop. */
const fetchFeedXml = async ({ feedUrl, fetchImpl, lookup } = {}) => {
  const { text, url } = await fetchPublicText({
    url: feedUrl,
    subject: FEED_SUBJECT,
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
    userAgent: 'Noeis reading watcher (+https://www.noeis.io)',
    contentTypePattern: /(xml|rss|atom|text\/plain|application\/octet-stream)/,
    contentTypeMessage: 'Reading watch URL did not return an RSS or Atom payload.',
    maxBytes: MAX_FEED_BYTES,
    fetchImpl,
    lookup
  });
  return { xml: text, canonicalFeedUrl: url };
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

const checkReadingWatchForPage = async ({ WikiSourceEvent, page, fetchImpl, lookup, now = () => new Date() } = {}) => {
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

const armReadingWatchForPage = async ({ WikiSourceEvent, page, feedUrl, label = '', fetchImpl, lookup } = {}) => {
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

const drainDueReadingWatches = async ({ models = {}, limit = 10, maxAgeMs = DEFAULT_READING_WATCH_MAX_AGE_MS, now = new Date(), fetchImpl, lookup } = {}) => {
  const { WikiPage, WikiSourceEvent } = models;
  if (!WikiPage || !WikiSourceEvent) return { processed: 0, failed: 0, skipped: true, results: [] };
  const cutoff = new Date(now.getTime() - Math.max(15 * 60 * 1000, Number(maxAgeMs) || DEFAULT_READING_WATCH_MAX_AGE_MS));
  const pages = await WikiPage.find({
    'externalWatches.reading.status': 'active',
    'createdFrom.label': { $not: HUMAN_ONLY_WIKI_LABEL_PATTERN },
    $or: [
      { 'externalWatches.reading.lastCheckedAt': null },
      { 'externalWatches.reading.lastCheckedAt': { $exists: false } },
      { 'externalWatches.reading.lastCheckedAt': { $lte: cutoff } }
    ]
  }).sort({ 'externalWatches.reading.lastCheckedAt': 1 }).limit(Math.max(1, Math.min(Number(limit) || 10, 50)));
  const results = [];
  let failed = 0;
  for (const page of (Array.isArray(pages) ? pages : []).filter(page => !isHumanOnlyWikiArtifact(page))) {
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
  __testables: { isPrivateAddress, readingExternalId }
};
const { HUMAN_ONLY_WIKI_LABEL_PATTERN, isHumanOnlyWikiArtifact } = require('./wikiProtectedArtifactService');
const { wordBoundaryTrim } = require('../lib/editorialText');
