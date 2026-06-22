const EMPTY_DOC = { type: 'doc', content: [] };

export const collectWikiText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectWikiText).join(' ');
  if (typeof node !== 'object') return '';
  return [node.text || '', collectWikiText(node.content)].filter(Boolean).join(' ');
};

export const countWikiWords = (value = '') => String(value || '').split(/\s+/).filter(Boolean).length;

export const countWikiClaimMarks = (node, out = new Set()) => {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach(child => countWikiClaimMarks(child, out));
    return out;
  }
  if (typeof node !== 'object') return out;
  (node.marks || []).forEach((mark) => {
    if (mark?.type !== 'claim') return;
    const attrs = mark.attrs || {};
    out.add(attrs.claimId ? String(attrs.claimId) : `${collectWikiText(node).slice(0, 120)}:${out.size}`);
  });
  if (Array.isArray(node.content)) countWikiClaimMarks(node.content, out);
  return out;
};

export const countWikiSources = (page = {}) => {
  page = page || {};
  const explicit = Number(page.sourceCount ?? page.sourcesCount);
  const sourceIds = new Set();
  [...(Array.isArray(page.sourceRefs) ? page.sourceRefs : []), ...(Array.isArray(page.sources) ? page.sources : [])]
    .forEach((source, index) => {
      sourceIds.add(source?._id || source?.id || source?.sourceRefId || `source-${index}`);
    });
  (Array.isArray(page.citations) ? page.citations : []).forEach((citation) => {
    const id = citation.sourceRefId || citation.sourceId || citation.sourceRef?._id || citation.sourceRef?.id;
    if (id) sourceIds.add(id);
  });
  return Math.max(Number.isFinite(explicit) ? explicit : 0, sourceIds.size);
};

export const countWikiClaims = (page = {}) => {
  page = page || {};
  const explicit = Number(page.claimCount ?? page.claimsCount);
  const claimIds = new Set();
  (Array.isArray(page.claims) ? page.claims : []).forEach((claim, index) => {
    claimIds.add(claim?.claimId || claim?._id || claim?.id || `claim-${index}`);
  });
  (Array.isArray(page.citations) ? page.citations : []).forEach((citation) => {
    const id = citation.claimId || citation.claim?._id || citation.claim?.id;
    if (id) claimIds.add(id);
  });
  countWikiClaimMarks(page.body).forEach(id => claimIds.add(id));
  return Math.max(Number.isFinite(explicit) ? explicit : 0, claimIds.size);
};

export const countWikiPageWords = (page = {}, body = null) => {
  page = page || {};
  const explicit = Number(page.wordCount ?? page.wordsCount);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const bodyWords = countWikiWords(collectWikiText(body || page.body || EMPTY_DOC));
  if (bodyWords > 0) return bodyWords;
  return countWikiWords(page.plainText || page.summary || page.scope || page.description || '');
};

export const cleanWikiPreviewText = (value = '', title = '') => {
  let text = String(value || '')
    .replace(/\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const trimmedTitle = String(title || '').replace(/\s+/g, ' ').trim();
  if (trimmedTitle && text.toLowerCase().startsWith(trimmedTitle.toLowerCase())) {
    text = text.slice(trimmedTitle.length).replace(/^[\s:–-]+/, '').trim();
  }
  return text;
};

export const clampWikiPreview = (value = '', budget = 160) => {
  if (value.length <= budget) return value;
  const slice = value.slice(0, budget);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
  if (lastStop > budget * 0.5) return slice.slice(0, lastStop + 1).trim();
  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : budget).trim()}...`;
};

export const wikiPreviewForPage = (page = {}, budget = 160) => {
  page = page || {};
  const source = page.summary || page.scope || page.description || page.plainText || collectWikiText(page.body || EMPTY_DOC) || '';
  return clampWikiPreview(cleanWikiPreviewText(source, page.title), budget);
};

export const WIKI_SCAFFOLD_PATTERN = /(still needs source-backed development|needs stronger source material|no matching library evidence|not enough source material|should explain the concept|needs source material|placeholder|scaffold)/i;

export const isWikiScaffoldPage = (page = {}) => {
  page = page || {};
  const bodyText = [
    page.summary,
    page.scope,
    page.description,
    page.plainText,
    collectWikiText(page.body || EMPTY_DOC),
    ...(Array.isArray(page.aiState?.health?.issues) ? page.aiState.health.issues.map(issue => issue?.text || issue?.label || '') : [])
  ].filter(Boolean).join(' ');
  return WIKI_SCAFFOLD_PATTERN.test(bodyText);
};

export const wikiSourceStatusForPage = (page = {}) => {
  const sources = countWikiSources(page);
  if (sources > 0) return `${sources} source${sources === 1 ? '' : 's'} · ${countWikiClaims(page)} claim${countWikiClaims(page) === 1 ? '' : 's'}`;
  return isWikiScaffoldPage(page) ? 'Draft scaffold · needs sources' : 'Draft · needs sources';
};

export const formatWikiRowDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const wikiRowMetaForPage = (page = {}) => {
  page = page || {};
  const sources = countWikiSources(page);
  if (sources === 0) return wikiSourceStatusForPage(page);
  const claims = countWikiClaims(page);
  const reviewedAt = page.lastReviewedAt || page.qualityReview?.reviewedAt;
  const parts = [
    `${sources} source${sources === 1 ? '' : 's'}`,
    `${claims} claim${claims === 1 ? '' : 's'}`
  ];
  if (reviewedAt) parts.push(`reviewed ${formatWikiRowDate(reviewedAt)}`);
  return parts.join(' · ');
};

export const isWikiSourceBackedPage = (page = {}) => countWikiSources(page) > 0;
