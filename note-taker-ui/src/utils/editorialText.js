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
 *   wordBoundaryTrim — list and utility surfaces (previews, labels, snippets)
 *     where an ellipsis is honest. Breaks on a whole word, and prefers a
 *     clause boundary when one falls late in the budget, so the trim reads
 *     like a pause the writer chose rather than an accident.
 *
 * Keep in lockstep with server/lib/editorialText.js.
 */

const ELLIPSIS = '…';

/** A trim landing on one of these reads as a breath, not a break. */
const CLAUSE_BOUNDARY = /[,;:—–](?=\s|$)/g;

/** Only honour a clause boundary that still keeps most of the budget. */
const CLAUSE_MIN_RATIO = 0.7;

export const normalizeSpaces = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export const sentenceBoundaryTrim = (value = '', {
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

export const wordBoundaryTrim = (value = '', {
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
