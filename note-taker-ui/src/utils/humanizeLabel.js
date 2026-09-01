/**
 * Turn a slug or machine key into a label a reader would write.
 * Dots, dashes and underscores are all separators: these are keys, not prose.
 *
 * The naive version of this — split on separators, uppercase every first
 * letter — was copied into ten files, and every copy destroyed the same two
 * things: acronyms became words ("this-week-in-ai" → "This Week In Ai") and
 * small joining words got promoted ("in" → "In").
 *
 * So this one knows two small vocabularies. Everything else is left alone.
 */

/** Names that are shouted, not spelled. Extend as the product meets more. */
const CANONICAL = new Map([
  ['ai', 'AI'], ['api', 'API'], ['ui', 'UI'], ['ux', 'UX'], ['os', 'OS'],
  ['id', 'ID'], ['qa', 'QA'], ['url', 'URL'], ['html', 'HTML'], ['css', 'CSS'],
  ['json', 'JSON'], ['http', 'HTTP'], ['https', 'HTTPS'], ['rss', 'RSS'],
  ['pdf', 'PDF'], ['seo', 'SEO'], ['sec', 'SEC'], ['llm', 'LLM'],
  ['gpu', 'GPU'], ['cpu', 'CPU'], ['ipo', 'IPO'], ['etf', 'ETF'],
  ['eps', 'EPS'], ['dcf', 'DCF'], ['roi', 'ROI'], ['cagr', 'CAGR'],
  ['rpo', 'RPO'], ['ev', 'EV'], ['oauth', 'OAuth'], ['saas', 'SaaS'],
  ['github', 'GitHub'], ['arxiv', 'arXiv'], ['youtube', 'YouTube']
]);

/** Words that stay small unless they open or close the label. */
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'nor',
  'of', 'on', 'or', 'per', 'the', 'to', 'up', 'via', 'vs', 'with'
]);

export const humanizeLabel = (value = '') => {
  const words = String(value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return '';

  return words.map((word, index) => {
    const lower = word.toLowerCase();
    const canonical = CANONICAL.get(lower);
    if (canonical) return canonical;
    // A word carrying its own capitals already knows how it is spelled.
    if (/[A-Z]/.test(word.slice(1))) return word;
    if (index > 0 && index < words.length - 1 && MINOR_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
};
