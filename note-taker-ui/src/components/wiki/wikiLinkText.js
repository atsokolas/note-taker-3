const INLINE_CITATION_TOKEN_PATTERN = /\[(?:\s*\d+\s*,)*\s*\d+\s*\]?/g;

export const cleanRawWikiLinkLabel = (value = '') => String(value || '')
  .replace(INLINE_CITATION_TOKEN_PATTERN, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Strip raw [[wikilink]] syntax from plain-text snippets (backlinks,
 * autolink suggestions) so "…the [[Circle of Competence]] and…" reads
 * as clean prose. Citation markers embedded in link labels are removed.
 */
export const cleanWikiLinkSnippetText = (value = '') => {
  const text = String(value || '');
  if (!text.includes('[[')) return text;

  let result = '';
  let cursor = 0;
  while (cursor < text.length) {
    const openIndex = text.indexOf('[[', cursor);
    if (openIndex === -1) {
      result += text.slice(cursor);
      break;
    }
    result += text.slice(cursor, openIndex);
    let closeIndex = text.indexOf(']]', openIndex + 2);
    while (closeIndex !== -1 && /\d/.test(text.charAt(closeIndex - 1))) {
      closeIndex = text.indexOf(']]', closeIndex + 1);
    }
    if (closeIndex === -1) {
      result += text.slice(openIndex).replace(/\[\[|\]\]/g, '');
      break;
    }
    const label = cleanRawWikiLinkLabel(text.slice(openIndex + 2, closeIndex));
    if (label) result += label;
    cursor = closeIndex + 2;
  }
  return result.replace(/  +/g, ' ');
};
