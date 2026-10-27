/**
 * Shared editorial trimmer (Taste Pass T6).
 *
 * Two primitives, one rule: prose is never cut mid-word.
 *
 *   sentenceBoundaryTrim — editorial surfaces (paper lead, claims, dossier
 *     summaries, judgment cards). A whole sentence or the fallback. If the
 *     text will not fit, the selector picks shorter text; the renderer never
 *     amputates.
 *
 *   plainTextFrom — markup in, prose out, for anything that has to preview
     stored HTML.

   wordBoundaryTrim — list and utility surfaces (previews, labels, snippets)
 *     where an ellipsis is honest. Breaks on a whole word, and prefers a
 *     clause boundary when one falls late in the budget, so the trim reads
 *     like a pause the writer chose rather than an accident.
 *
 * Generated mirror of note-taker-ui/src/utils/editorialText.js. Edit that one.
 */

const ELLIPSIS = '…';

/** A trim landing on one of these reads as a breath, not a break. */
const CLAUSE_BOUNDARY = /[,;:—–](?=\s|$)/g;

/** Only honour a clause boundary that still keeps most of the budget. */
const CLAUSE_MIN_RATIO = 0.7;

const normalizeSpaces = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

/**
 * Markup out, prose in. Tags collapse to a space rather than to nothing, so
 * `<p>one</p><p>two</p>` reads as two words and not as one invented one.
 */
const plainTextFrom = (value = '') => normalizeSpaces(String(value || '').replace(/<[^>]*>/g, ' '));

/**
 * A rich-text document as prose. Inline pieces join as written, because a
 * text node already carries its own spaces: "word" then ", next" is
 * "word, next", never "word , next". Blocks (a heading, a paragraph, a list
 * item) each end their line, so a heading stays its own line instead of
 * running into the sentence after it.
 */
const isBlockNode = node => Boolean(node) && typeof node === 'object' && Array.isArray(node.content);

const docText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return '';
  if (!Array.isArray(node)) {
    if (typeof node.text === 'string') return node.text;
    if (node.type === 'hardBreak') return '\n';
  }
  const children = Array.isArray(node) ? node : (node.content || []);
  return children.reduce((text, child) => {
    const piece = docText(child);
    if (!piece) return text;
    return text && isBlockNode(child) ? `${text.trimEnd()}\n${piece.trim()}` : `${text}${piece}`;
  }, '').trim();
};

const sentenceBoundaryTrim = (value = '', {
  maxLength = 280,
  fallback = ''
} = {}) => {
  const text = normalizeSpaces(value)
    .replace(/^["']|["']$/g, '')
    .replace(/\s+\[\d+(?:,\s*\d+)*\]\s*$/g, '')
    .trim();

  if (!text) return fallback;
  if (text.length <= maxLength) return text;

  const boundaryPattern = /[.!?](?=\s|$)/g;
  let match;
  let boundary = -1;
  while ((match = boundaryPattern.exec(text)) !== null) {
    if (match.index + 1 <= maxLength) boundary = match.index + 1;
  }
  if (boundary > 0) return text.slice(0, boundary).trim();
  return fallback;
};

const wordBoundaryTrim = (value = '', {
  maxLength = 180,
  ellipsis = ELLIPSIS
} = {}) => {
  const text = normalizeSpaces(value);
  if (!text || text.length <= maxLength) return text;

  const window = text.slice(0, maxLength);

  let clause = -1;
  let match;
  CLAUSE_BOUNDARY.lastIndex = 0;
  while ((match = CLAUSE_BOUNDARY.exec(window)) !== null) clause = match.index;
  if (clause >= maxLength * CLAUSE_MIN_RATIO) {
    return `${window.slice(0, clause).trimEnd()}${ellipsis}`;
  }

  // The window may already end on a complete word; only back up when it does not.
  const splitsAWord = !/\s/.test(text.charAt(maxLength));
  const whole = splitsAWord ? window.replace(/\s+\S*$/, '').trimEnd() : window.trimEnd();

  // An unbroken token longer than the budget has no boundary to find.
  return `${whole || window.trimEnd()}${ellipsis}`;
};

module.exports = {
  docText,
  normalizeSpaces,
  plainTextFrom,
  sentenceBoundaryTrim,
  wordBoundaryTrim
};
