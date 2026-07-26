const crypto = require('crypto');
const { padCik } = require('./edgarWatcherService');

const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
const JINA_READER_URL = 'https://r.jina.ai';
const DEFAULT_USER_AGENT = 'NoeisBot/1.0 contact@noeis.io';
const PRODUCT_PATH_PATTERN = /(?:^|[^a-z0-9])(product|products|solution|solutions|service|services|platform|technology|technologies|industries|membership|customers|business|equipment|software|cloud)(?=$|[^a-z0-9])/i;
const LOW_VALUE_PATH_PATTERN = /(?:^|[^a-z0-9])(privacy|legal|terms|careers|jobs|press|news|investor|search|support|account|login|signin|dealer|contact)(?=$|[^a-z0-9])/i;
const PRODUCT_TEXT_PATTERN = /\b(product|products|solution|solutions|service|services|platform|technology|technologies|customer|customers|membership|equipment|software|capabilities|industries|operations)\b/gi;
const EVIDENCE_DIMENSIONS = Object.freeze({
  offering: /\b(product|products|solution|solutions|service|services|platform|equipment|membership)\b/i,
  customer: /\b(customer|customers|use case|use cases|industry|industries|member|members)\b/i,
  capability: /\b(capability|capabilities|technology|technical|performance|specification|specifications|software)\b/i,
  commercial: /\b(pricing|price|subscription|financing|terms|fee|fees)\b/i,
  delivery: /\b(distribution|delivery|dealer|support|implementation|integration|operations)\b/i
});
const isTransientError = error => (
  error?.name === 'AbortError'
  || Number(error?.statusCode) === 408
  || Number(error?.statusCode) === 429
  || Number(error?.statusCode) >= 500
);

const clean = (value = '', limit = 12000) => String(value || '')
  .replace(/\r/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{4,}/g, '\n\n\n')
  .trim()
  .slice(0, limit);

const fetchWithTimeout = async ({
  fetchImpl,
  url,
  options = {},
  timeoutMs = 20000
} = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 20000));
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const readTextBounded = async (response, maxBytes = 1000000) => {
  const declaredBytes = Number(response?.headers?.get?.('content-length') || 0);
  if (declaredBytes > maxBytes) {
    const error = new Error('Official source exceeded the response-size limit.');
    error.statusCode = 413;
    throw error;
  }
  if (!response?.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      const error = new Error('Official source exceeded the response-size limit.');
      error.statusCode = 413;
      throw error;
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      const error = new Error('Official source exceeded the response-size limit.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const isSafePublicWebsite = (value = '') => {
  try {
    const parsed = new URL(String(value || '').trim());
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && !(
      (parsed.protocol === 'https:' && parsed.port === '443')
      || (parsed.protocol === 'http:' && parsed.port === '80')
    )) return false;
    if (!hostname || !hostname.includes('.')) return false;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
    if (hostname === '0.0.0.0' || hostname === '::1' || hostname.startsWith('[')) return false;
    return true;
  } catch {
    return false;
  }
};

const canonicalPublicWebsite = (value = '') => {
  if (!isSafePublicWebsite(value)) return '';
  const parsed = new URL(String(value).trim());
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString();
};

const comparableHostname = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/\.$/, '')
  .replace(/^www\./, '');

const identityTokens = (value = '') => new Set(
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 4)
    .filter(token => !['company', 'corporation', 'incorporated', 'limited', 'holdings', 'group'].includes(token))
);

const companyIdentityMatches = (companyName = '', itemLabel = '') => {
  const companyTokens = identityTokens(companyName);
  const itemTokens = identityTokens(itemLabel);
  if (!companyTokens.size || !itemTokens.size) return false;
  return Array.from(companyTokens).some(token => itemTokens.has(token));
};

const isSameOfficialHostname = (candidate = '', official = '') => {
  try {
    return comparableHostname(new URL(candidate).hostname) === comparableHostname(new URL(official).hostname);
  } catch {
    return false;
  }
};

const buildWikidataQueryUrl = (cik = '') => {
  const paddedCik = padCik(cik);
  const query = [
    'SELECT ?item ?itemLabel ?website WHERE {',
    `  ?item wdt:P5531 "${paddedCik}";`,
    '        wdt:P856 ?website.',
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    '} LIMIT 5'
  ].join('\n');
  return `${WIKIDATA_SPARQL_URL}?query=${encodeURIComponent(query)}`;
};

const fetchWikidataOfficialWebsite = async ({
  cik = '',
  fetchImpl = global.fetch,
  userAgent = DEFAULT_USER_AGENT
} = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available for official-site discovery.');
  const response = await fetchWithTimeout({
    fetchImpl,
    url: buildWikidataQueryUrl(cik),
    timeoutMs: 12000,
    options: {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': userAgent
      }
    }
  });
  if (!response?.ok) {
    const error = new Error(`Official-site discovery failed with HTTP ${response?.status || 'unknown'}.`);
    error.statusCode = response?.status || 500;
    throw error;
  }
  const payload = await response.json();
  const bindings = Array.isArray(payload?.results?.bindings) ? payload.results.bindings : [];
  const match = bindings
    .map(binding => ({
      itemUrl: clean(binding?.item?.value || '', 500),
      itemLabel: clean(binding?.itemLabel?.value || '', 240),
      website: canonicalPublicWebsite(binding?.website?.value || '')
    }))
    .find(row => isSafePublicWebsite(row.website));
  if (!match) {
    const error = new Error('No safe official website was found for the issuer CIK.');
    error.code = 'OFFICIAL_WEBSITE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  return match;
};

const readerUrlFor = (targetUrl = '') => `${JINA_READER_URL}/${String(targetUrl || '').trim()}`;

const parseReaderDocument = (body = '') => {
  const raw = String(body || '');
  const title = clean(raw.match(/^Title:\s*(.+)$/mi)?.[1] || '', 240);
  const sourceUrl = clean(raw.match(/^URL Source:\s*(.+)$/mi)?.[1] || '', 1000);
  const marker = raw.match(/^Markdown Content:\s*$/mi);
  const markdown = clean(marker ? raw.slice(marker.index + marker[0].length) : raw, 30000);
  return { title, sourceUrl, markdown };
};

const fetchReaderDocument = async ({
  url = '',
  officialWebsite = '',
  fetchImpl = global.fetch,
  userAgent = DEFAULT_USER_AGENT
} = {}) => {
  if (!isSafePublicWebsite(url) || !isSameOfficialHostname(url, officialWebsite)) {
    const error = new Error('Official source URL failed the issuer-domain check.');
    error.code = 'OFFICIAL_SOURCE_DOMAIN_MISMATCH';
    error.statusCode = 422;
    throw error;
  }
  const response = await fetchWithTimeout({
    fetchImpl,
    url: readerUrlFor(url),
    timeoutMs: 12000,
    options: {
      headers: {
        Accept: 'text/plain',
        'User-Agent': userAgent,
        'X-Return-Format': 'markdown'
      }
    }
  });
  if (!response?.ok) {
    const error = new Error(`Official source reader failed with HTTP ${response?.status || 'unknown'}.`);
    error.statusCode = response?.status || 500;
    throw error;
  }
  const document = parseReaderDocument(await readTextBounded(response));
  if (!document.sourceUrl || !isSameOfficialHostname(document.sourceUrl, officialWebsite)) {
    const error = new Error('The rendered source did not resolve to the verified issuer domain.');
    error.code = 'OFFICIAL_SOURCE_REDIRECT_MISMATCH';
    error.statusCode = 422;
    throw error;
  }
  return document;
};

const markdownLinks = ({ markdown = '', baseUrl = '', officialWebsite = '' } = {}) => {
  const links = [];
  const seen = new Set();
  const pattern = /\[([^\]]{1,160})\]\((https?:\/\/[^)\s]+)\)/g;
  let match;
  while ((match = pattern.exec(String(markdown || '')))) {
    try {
      const parsed = new URL(match[2], baseUrl);
      parsed.hash = '';
      parsed.search = '';
      if (!isSafePublicWebsite(parsed.toString())) continue;
      if (!isSameOfficialHostname(parsed.toString(), officialWebsite)) continue;
      const normalized = parsed.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const pathText = `${parsed.pathname} ${match[1]}`;
      const strategicScore = /technology|platform|software|digital|precision/i.test(pathText)
        ? 8
        : /membership|services|solutions|industries/i.test(pathText)
          ? 4
          : 0;
      const readerScore = /\b(explore|learn|overview|how)\b/i.test(match[1]) ? 2 : 0;
      const depthPenalty = Math.max(0, parsed.pathname.split('/').filter(Boolean).length - 5);
      const score = (PRODUCT_PATH_PATTERN.test(pathText) ? 10 : 0)
        + strategicScore
        + readerScore
        - depthPenalty
        - (LOW_VALUE_PATH_PATTERN.test(pathText) ? 20 : 0)
        - (/\bsign\s*in\b/i.test(match[1]) ? 20 : 0)
        - (/\.(?:pdf|zip|jpg|jpeg|png|svg|webp|gif)$/i.test(parsed.pathname) ? 20 : 0);
      if (score <= 0) continue;
      links.push({ url: normalized, label: clean(match[1], 160), score });
    } catch {
      // Ignore malformed links in third-party reader output.
    }
  }
  return links
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, 8);
};

const assessProductDocument = ({ document = {}, officialWebsite = '' } = {}) => {
  const markdown = clean(document.markdown || '', 30000);
  const words = markdown.split(/\s+/).filter(Boolean);
  const headings = markdown.split('\n').filter(line => /^#{1,4}\s+\S/.test(line));
  const productSignals = new Set(
    (markdown.match(PRODUCT_TEXT_PATTERN) || []).map(value => value.toLowerCase())
  );
  const evidenceDimensions = Object.entries(EVIDENCE_DIMENSIONS)
    .filter(([, pattern]) => pattern.test(markdown))
    .map(([id]) => id);
  const links = markdownLinks({
    markdown,
    baseUrl: document.sourceUrl,
    officialWebsite
  });
  const accepted = words.length >= 180
    && markdown.length >= 1200
    && headings.length >= 2
    && evidenceDimensions.length >= 2
    && (productSignals.size >= 3 || links.length >= 3);
  return {
    accepted,
    wordCount: words.length,
    characterCount: markdown.length,
    headingCount: headings.length,
    productSignalCount: productSignals.size,
    evidenceDimensions,
    productLinks: links,
    reasons: accepted
      ? []
      : ['Official page did not contain enough product, service, customer, or operating detail.']
  };
};

const sourceRefFromDocument = ({
  document = {},
  assessment = {},
  officialWebsite = '',
  discovery = {},
  ticker = '',
  now = new Date()
} = {}) => {
  const retrievedAt = new Date(now).toISOString();
  const snippet = clean(document.markdown || '', 12000);
  const contentHash = crypto.createHash('sha256').update(snippet).digest('hex');
  return {
    type: 'external',
    title: clean(document.title || `${ticker} official product page`, 240),
    snippet,
    url: document.sourceUrl,
    citationLabel: `Official company source · retrieved ${retrievedAt.slice(0, 10)}`,
    provider: 'official-company-site',
    metadata: {
      evidenceArchetype: 'company_product',
      sourceClass: 'company_product',
      acquisitionMethod: 'wikidata_jina_reader',
      ticker: clean(ticker, 20).toUpperCase(),
      officialWebsite,
      discovery: {
        provider: 'wikidata',
        itemUrl: discovery.itemUrl || '',
        itemLabel: discovery.itemLabel || ''
      },
      provenance: {
        retrievedAt,
        contentHash,
        originalUrl: document.sourceUrl,
        renderedVia: JINA_READER_URL,
        licenseOrAccess: 'public'
      },
      validation: {
        status: 'accepted',
        officialDomainMatched: true,
        wordCount: assessment.wordCount,
        characterCount: assessment.characterCount,
        headingCount: assessment.headingCount,
        productSignalCount: assessment.productSignalCount,
        evidenceDimensions: assessment.evidenceDimensions,
        reasons: []
      }
    },
    addedBy: 'ai'
  };
};

const acquireOfficialProductSources = async ({
  cik = '',
  ticker = '',
  companyName = '',
  fetchImpl = global.fetch,
  now = new Date(),
  maxSources = 1
} = {}) => {
  let discovery;
  try {
    discovery = await fetchWikidataOfficialWebsite({ cik, fetchImpl });
  } catch (error) {
    if (isTransientError(error)) throw error;
    return {
      sourceRefs: [],
      stop: {
        code: error.code || 'OFFICIAL_WEBSITE_DISCOVERY_FAILED',
        evidenceArchetype: 'company_product',
        message: 'Noeis could not verify a free official company website for this issuer.'
      },
      diagnostic: clean(error.message, 500)
    };
  }
  if (!companyIdentityMatches(companyName, discovery.itemLabel)) {
    return {
      sourceRefs: [],
      stop: {
        code: 'OFFICIAL_WEBSITE_IDENTITY_MISMATCH',
        evidenceArchetype: 'company_product',
        message: 'The free official-site record did not match the SEC issuer identity.'
      }
    };
  }
  const officialWebsite = discovery.website;
  const accepted = [];
  let homepageFallback = null;
  const visited = new Set();
  const queue = [officialWebsite];
  const transientErrors = [];
  while (queue.length && visited.size < 5 && accepted.length < Math.max(1, Number(maxSources) || 2)) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const document = await fetchReaderDocument({
        url,
        officialWebsite,
        fetchImpl
      });
      const assessment = assessProductDocument({ document, officialWebsite });
      if (assessment.accepted) {
        const sourceRef = sourceRefFromDocument({
          document,
          assessment,
          officialWebsite,
          discovery,
          ticker,
          now
        });
        if (visited.size === 1) homepageFallback = sourceRef;
        else accepted.push(sourceRef);
      }
      if (visited.size === 1) {
        queue.push(...assessment.productLinks.map(link => link.url));
      }
    } catch (error) {
      if (isTransientError(error)) transientErrors.push(error);
      // Continue through the bounded set of same-domain product candidates.
    }
  }
  if (!accepted.length && homepageFallback) accepted.push(homepageFallback);
  if (!accepted.length) {
    if (transientErrors.length) throw transientErrors.at(-1);
    return {
      sourceRefs: [],
      stop: {
        code: 'OFFICIAL_PRODUCT_EVIDENCE_INSUFFICIENT',
        evidenceArchetype: 'company_product',
        message: 'The verified official website did not yield enough readable product or service evidence.'
      }
    };
  }
  return { sourceRefs: accepted, stop: null, discovery };
};

module.exports = {
  acquireOfficialProductSources,
  assessProductDocument,
  buildWikidataQueryUrl,
  fetchReaderDocument,
  fetchWikidataOfficialWebsite,
  isSafePublicWebsite,
  isSameOfficialHostname,
  markdownLinks,
  parseReaderDocument,
  readerUrlFor
};
