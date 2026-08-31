import { isJudgmentPage, oneSentence } from '../../pages/judgmentModel';
import { parseSourceOrigin } from '../../utils/sourceRoutes';
import { normalizeSpaces } from '../../utils/editorialText';

// The folio line on a source you are reading.
//
// If you already hold a claim that this source speaks to, the page carries
// that sentence as a running italic — what you hold, in your ink, while you
// read. It is one line, or it is absent. An unrelated article is silent.

const LAST_OPENED_KEY = 'noeis.judgment.lastOpened';

const idOf = (value) => normalizeSpaces(value?._id || value?.id || value);
const list = (value) => (Array.isArray(value) ? value : []);
const time = (value) => {
  const parsed = new Date(value || 0).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const idsMatch = (left, right) => {
  const a = idOf(left);
  const b = idOf(right);
  return Boolean(a) && a === b;
};

/** The claim you were just looking at, so a source that speaks to several
 *  can prefer that one instead of stacking a list. */
export const rememberOpenedJudgment = (pageId) => {
  const id = idOf(pageId);
  if (!id || typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(LAST_OPENED_KEY, id);
  } catch (_error) {
    // Private mode still has to read; it just cannot remember.
  }
};

export const lastOpenedJudgment = () => {
  if (typeof window === 'undefined') return '';
  try {
    return normalizeSpaces(window.sessionStorage?.getItem(LAST_OPENED_KEY));
  } catch (_error) {
    return '';
  }
};

export const claimIdFromSearch = (search = '') => {
  const raw = String(search || '');
  const query = raw.startsWith('?') ? raw.slice(1) : raw;
  const params = new URLSearchParams(query);
  return normalizeSpaces(params.get('judgment') || params.get('claim'));
};

/** The opinion, never the wiki name. An unnamed case still has a sentence. */
export const folioSentence = (page) => oneSentence(page?.judgment?.currentJudgment);

export const folioHref = (page) => {
  const id = idOf(page);
  return id ? `/judgment/${id}` : '';
};

export const sourceRefTouchesArticle = (ref, articleId, highlightIds = []) => {
  if (!idOf(articleId)) return false;
  if (idsMatch(ref?.objectId, articleId)) return true;
  if (idsMatch(ref?.parentObjectId, articleId)) return true;
  if (idsMatch(ref?.parentArticleId, articleId)) return true;
  if (idsMatch(ref?.articleId, articleId)) return true;
  if (idsMatch(ref?.sourceObjectId, articleId)) return true;
  return list(highlightIds).some((highlightId) => idsMatch(ref?.objectId, highlightId));
};

const reasonLines = (page) => {
  const judgment = page?.judgment || {};
  return [
    ...list(judgment.why),
    ...list(judgment.against),
    ...list(judgment.assumptions)
  ];
};

const lineTouchesArticle = (line, articleId, highlightIds = []) => {
  const origin = parseSourceOrigin(line?.acceptedFrom);
  if (idsMatch(origin.articleId, articleId)) return true;
  if (origin.highlightId && list(highlightIds).some((id) => idsMatch(id, origin.highlightId))) {
    return true;
  }
  return list(line?.sourceRefIds).some((refId) => idsMatch(refId, articleId));
};

/** Wiki and graph ids for a judgment page this source already belongs to. */
export const connectedJudgmentIds = (graphConnections = {}) => {
  const ids = [];
  const push = (type, rawId) => {
    const kind = normalizeSpaces(type).toLowerCase();
    const id = idOf(rawId);
    if (!id) return;
    if (kind !== 'wiki_page' && kind !== 'wiki' && kind !== 'wiki_claim') return;
    const parts = id.split(':').filter(Boolean);
    if (kind === 'wiki_claim' && parts[0] === 'wiki_claim' && parts[1]) {
      ids.push(parts[1]);
      return;
    }
    if (kind === 'wiki_claim' && parts.length >= 2) {
      ids.push(parts[0]);
      return;
    }
    ids.push(id);
  };

  list(graphConnections?.outgoing).forEach((row) => {
    push(row?.toType || row?.itemType || row?.type, row?.toId || row?.itemId || row?.target?.id);
  });
  list(graphConnections?.incoming).forEach((row) => {
    push(row?.fromType || row?.itemType || row?.type, row?.fromId || row?.itemId || row?.source?.id);
  });
  return ids;
};

export const pageSpeaksToSource = (page, articleId, { highlightIds = [], connectedPageIds = [] } = {}) => {
  if (!idOf(articleId) || !isJudgmentPage(page) || !folioSentence(page)) return false;
  if (list(connectedPageIds).some((id) => idsMatch(id, page))) return true;
  if (list(page?.sourceRefs).some((ref) => sourceRefTouchesArticle(ref, articleId, highlightIds))) {
    return true;
  }
  if (list(page?.claims).some((claim) => (
    list(claim?.sourceRefIds).some((refId) => idsMatch(refId, articleId))
  ))) {
    return true;
  }
  return reasonLines(page).some((line) => lineTouchesArticle(line, articleId, highlightIds));
};

const recency = (page) => time(page?.updatedAt || page?.judgment?.lastReviewedAt || page?.createdAt);

export const pickFolioPage = (pages, {
  articleId,
  highlightIds = [],
  connectedPageIds = [],
  preferredId = '',
  recentlyOpenedId = ''
} = {}) => {
  const related = list(pages).filter((page) => pageSpeaksToSource(page, articleId, {
    highlightIds,
    connectedPageIds
  }));
  if (!related.length) return null;

  const preferred = related.find((page) => idsMatch(page, preferredId));
  if (preferred) return preferred;

  const recent = related.find((page) => idsMatch(page, recentlyOpenedId));
  if (recent) return recent;

  const kept = related.filter((page) => page?.evergreen);
  const pool = kept.length ? kept : related;
  return pool.slice().sort((left, right) => recency(right) - recency(left))[0] || null;
};

export const buildFolioLine = (page) => {
  const text = folioSentence(page);
  const href = folioHref(page);
  if (!text || !href) return null;
  return { id: idOf(page), text, href };
};

/**
 * One line for the reader, or null. Prefer the claim the human is in, then
 * one they kept, then the most recently updated — never a list.
 */
export const pickFolioLine = (pages, options = {}) => {
  const preferredId = normalizeSpaces(options.preferredId) || claimIdFromSearch(options.search);
  const recentlyOpenedId = normalizeSpaces(options.recentlyOpenedId) || lastOpenedJudgment();
  return buildFolioLine(pickFolioPage(pages, {
    ...options,
    preferredId,
    recentlyOpenedId
  }));
};
