const { fetchPublicText } = require('../lib/publicUrlFetch');

/**
 * Turning a link into something you can actually read.
 *
 * The save door on an edition creates a library row with a title, a source
 * and a date — and no content, because nothing on the server has ever fetched
 * a page. Only the browser extension extracts, so a source taken from a paper
 * an agent wrote arrived as a stub: a row you could file but not read, and
 * certainly not highlight.
 *
 * That is the seam in "seamless". This closes it.
 *
 * It is deliberately not a full readability port. Those are large, and most of
 * their cleverness goes on layouts this never sees. What earns its place is
 * the small set of rules that decide whether a saved page is readable at all:
 * drop the furniture, prefer the element that actually holds the article, and
 * keep paragraph breaks so the reader can highlight a sentence rather than a
 * wall.
 */

const MAX_ARTICLE_BYTES = 2 * 1024 * 1024;
const MAX_CONTENT_LENGTH = 200000;

/* Everything that is on the page but not in the piece. Removed with their
   contents, since a nav's text is worse than useless — it is text that looks
   like prose to everything downstream. */
const FURNITURE = /<(script|style|noscript|iframe|svg|form|nav|aside|header|footer|template|button|select)\b[^>]*>[\s\S]*?<\/\1>/gi;

/* Self-closing furniture, which the pair above cannot catch. */
const VOID_FURNITURE = /<(link|meta|input|img|source|track)\b[^>]*\/?>/gi;

/* The element that holds the article, in the order worth trying. A page that
   names its own content is telling the truth more often than any heuristic. */
const CONTAINERS = [
  /<article\b[^>]*>([\s\S]*?)<\/article>/i,
  /<main\b[^>]*>([\s\S]*?)<\/main>/i,
  /<[^>]+\brole=["']main["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
  /<body\b[^>]*>([\s\S]*?)<\/body>/i
];

const ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…'
});

const decodeEntities = (value = '') => String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code) || 32))
  .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[String(name).toLowerCase()] ?? match);

const stripTags = (html = '') => decodeEntities(
  String(html || '')
    .replace(FURNITURE, ' ')
    .replace(VOID_FURNITURE, ' ')
    /* Block ends become paragraph breaks before the tags go, or the whole
       piece collapses into one unhighlightable line. */
    .replace(/<\/(p|div|section|article|h[1-6]|li|blockquote|tr|pre)\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
)
  .replace(/[ \t ]+/g, ' ')
  .replace(/ ?\n ?/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/** The page's own title, preferring what it tells sharers over its tab name. */
const titleFrom = (html = '') => {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const tag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return decodeEntities(og?.[1] || tag?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 300);
};

/**
 * The article body, or the whole page if it does not say where its body is.
 *
 * The longest candidate wins rather than the first: a page can carry an empty
 * `<article>` wrapper around the real content, and length is a blunt but
 * honest proxy for which one is the piece.
 */
const bodyFrom = (html = '') => {
  const found = CONTAINERS
    .map(pattern => html.match(pattern)?.[1] || '')
    .map(stripTags)
    .filter(Boolean);
  if (!found.length) return stripTags(html);
  return found.sort((left, right) => right.length - left.length)[0];
};

/**
 * Fetch a URL and return what a reader would call the article.
 *
 * Never throws for the caller's sake: a source that will not fetch is still a
 * source worth saving, and a save that failed because a paywall answered 403
 * should file the row and say so — not lose the reader's click.
 */
const fetchReadableArticle = async ({ url, fetchImpl, lookup } = {}) => {
  try {
    const { text: html, url: finalUrl } = await fetchPublicText({
      url,
      subject: 'That source',
      accept: 'text/html,application/xhtml+xml',
      userAgent: 'Noeis (+https://www.noeis.io)',
      contentTypePattern: /(text\/html|application\/xhtml)/,
      contentTypeMessage: 'That source is not a readable web page.',
      maxBytes: MAX_ARTICLE_BYTES,
      fetchImpl,
      lookup
    });
    const content = bodyFrom(html).slice(0, MAX_CONTENT_LENGTH);
    return { ok: true, url: finalUrl, title: titleFrom(html), content, error: '' };
  } catch (error) {
    return { ok: false, url: '', title: '', content: '', error: String(error?.message || 'Could not read that source.') };
  }
};

module.exports = {
  MAX_ARTICLE_BYTES,
  MAX_CONTENT_LENGTH,
  bodyFrom,
  fetchReadableArticle,
  stripTags,
  titleFrom
};
