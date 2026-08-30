/**
 * Shared editorial trimmer (Taste Pass T6).
 *
 * Sentence-boundary trim or full render — never a mid-word / mid-clause
 * ellipsis. If a whole sentence cannot fit, return the fallback and let
 * the selector pick shorter text.
 */

const normalizeSpaces = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

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
