const SNIPPET_LIMIT = 280;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'how', 'if', 'in', 'into', 'is', 'it',
  'me', 'my', 'not', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'to', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'with',
  'you', 'your'
]);

const cleanText = (value = '') => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

const queryTokens = (query = '') => (
  (String(query || '').toLowerCase().match(/[a-z0-9']+/g) || [])
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
);

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Highlights cannot require the whole joined query as one substring.
   “patience avoidance” is two words; a saved line that holds both still counts. */
const highlightFieldMatch = (query = '') => {
  const tokens = queryTokens(query);
  const needles = tokens.length ? tokens : [String(query || '').trim()].filter(Boolean);
  return {
    $or: needles.flatMap((token) => {
      const r = new RegExp(escapeRegExp(token), 'i');
      return [
        { 'highlights.text': r },
        { 'highlights.note': r },
        { 'highlights.tags': r },
        { title: r }
      ];
    })
  };
};

/* Open the line that earned the match, not the first 280 characters.
   Find and the Search page both read this preview; a leading slice drops
   ordinary long articles after the client re-checks the truncated text. */
const snippetAroundQuery = (text, query, { limit = SNIPPET_LIMIT } = {}) => {
  const clean = cleanText(text);
  if (!clean) return '';
  const hay = clean.toLowerCase();
  let at = -1;
  queryTokens(query).forEach((token) => {
    const index = hay.indexOf(token);
    if (index >= 0 && (at < 0 || index < at)) at = index;
  });
  if (at < 0) return clean.slice(0, limit);
  const start = Math.max(0, at - Math.floor(limit / 3));
  const windowed = clean.slice(start, start + limit).trim();
  return start > 0 ? `… ${windowed}` : windowed;
};

module.exports = {
  SNIPPET_LIMIT,
  queryTokens,
  highlightFieldMatch,
  snippetAroundQuery
};
