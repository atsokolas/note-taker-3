const { fetchPublicText } = require('../../lib/publicUrlFetch');

// Numeric references are decoded generically rather than by listing them. The
// previous list matched &#39; but not &#039; — the zero-padded form Wikipedia
// emits — so imported pages were titled "Goodhart&#039;s law - Wikipedia" on
// production, and that title is the first thing a new user sees.
const decodeNumericEntities = (value = '') => String(value || '')
  .replace(/&#(\d+);/g, (_match, code) => {
    const point = Number(code);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : _match;
  })
  .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
    const point = parseInt(hex, 16);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : _match;
  });

const decodeHtmlEntities = (value = '') => decodeNumericEntities(
  String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
)
  // Ampersand last: decoding it first would turn "&amp;#039;" into a live entity.
  .replace(/&amp;/gi, '&');

const stripHtml = (html = '') => decodeHtmlEntities(
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|main|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const extractTagContent = (html = '', tagName = '') => {
  const match = String(html || '').match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? match[1] : '';
};

const extractSiteName = (html = '') => {
  const match = String(html || '').match(/<meta\b[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    || String(html || '').match(/<meta\b[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  return match?.[1] ? decodeHtmlEntities(match[1]).trim() : '';
};

const compareKey = (value = '') => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Host labels worth comparing against: drop the TLD and the routing prefixes
// ("en.", "www.", "m.") that are not what anyone calls the publication.
const hostLabels = (hostname = '') => String(hostname || '')
  .toLowerCase()
  .split('.')
  .slice(0, -1)
  .filter((label) => label && !['www', 'm', 'en'].includes(label));

/**
 * Pages title themselves for a browser tab, not for a library. "Survivorship
 * bias - Wikipedia" reads as a page about two things, and a shelf of them reads
 * as a shelf of Wikipedia rather than a shelf of ideas.
 *
 * Only the publication gets removed, never a subtitle: the trailing segment has
 * to match what the page itself says it is (og:site_name) or the host it came
 * from. "Fooled by Randomness - The Hidden Role of Chance" keeps its second half
 * because nothing claims that half is a publisher.
 */
const stripSiteSuffix = (title = '', { siteName = '', hostname = '' } = {}) => {
  const known = [siteName, ...hostLabels(hostname)].map(compareKey).filter(Boolean);
  if (!known.length) return String(title || '').trim();

  let result = String(title || '').trim();
  // Twice: "Goodhart's law - Wikipedia - Wikipedia" happens, and so does a page
  // that names both its section and its site.
  for (let pass = 0; pass < 2; pass += 1) {
    const split = result.match(/^(.*\S)\s*[-|–—:·]{1,2}\s*([^-|–—:·]+)$/);
    if (!split) break;
    const [, head, tail] = split;
    const tailKey = compareKey(tail);
    if (!tailKey || !known.includes(tailKey)) break;
    if (head.trim().length < 3) break;
    result = head.trim();
  }
  return result;
};

const extractTitle = (html = '', fallback = '') => {
  const ogTitle = String(html || '').match(/<meta\b[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || String(html || '').match(/<meta\b[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitle?.[1]) return decodeHtmlEntities(ogTitle[1]).trim();
  const title = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  // stripHtml already decodes. Decoding again turned an escaped "&amp;#039;" into
  // a live apostrophe, i.e. decoded content that the page had deliberately escaped.
  if (title?.[1]) return stripHtml(title[1]).trim();
  return fallback;
};

const extractReadableText = (html = '') => {
  const article = extractTagContent(html, 'article');
  if (article) return stripHtml(article);
  const main = extractTagContent(html, 'main');
  if (main) return stripHtml(main);
  const body = extractTagContent(html, 'body');
  return stripHtml(body || html);
};

const normalizeIngestText = (value = '', maxLength = 120000) => (
  String(value || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, maxLength)
);

/**
 * The URL is pasted by a person and fetched by the server, which is the shape
 * of every SSRF. It goes through the public-URL guard rather than a bare fetch:
 * no localhost, no private address, every redirect re-checked, the read bounded.
 * Without it a paste of http://169.254.169.254/ would have the server read its
 * own metadata service and file the answer in the reader's library.
 */
const fetchUrlForIngest = async ({ url, fetchImpl, lookup, timeoutMs = 12000 } = {}) => {
  const { text: raw, url: finalUrl, contentType } = await fetchPublicText({
    url,
    subject: 'That URL',
    accept: 'text/html, text/plain;q=0.9,*/*;q=0.5',
    userAgent: 'NoeisBot/1.0 (+https://www.noeis.io)',
    maxBytes: 2 * 1024 * 1024,
    timeoutMs: Math.max(1000, Number(timeoutMs) || 12000),
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(lookup ? { lookup } : {})
  });
  const { hostname } = new URL(finalUrl);
  const isHtml = String(contentType || '').includes('html');
  const title = isHtml
    ? stripSiteSuffix(extractTitle(raw, hostname), { siteName: extractSiteName(raw), hostname })
    : hostname;
  return {
    url: finalUrl,
    title: title || hostname,
    text: normalizeIngestText(isHtml ? extractReadableText(raw) : normalizeIngestText(raw))
  };
};

module.exports = {
  stripSiteSuffix,
  extractReadableText,
  extractTitle,
  fetchUrlForIngest,
  normalizeIngestText,
  stripHtml
};
