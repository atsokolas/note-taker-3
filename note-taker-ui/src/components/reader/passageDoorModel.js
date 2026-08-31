import { isJudgmentPage } from '../../pages/judgmentModel';
import { answersHeldSentence } from '../../pages/judgmentHold';
import { parseSourceOrigin } from '../../utils/sourceRoutes';
import { folioHref, folioSentence, lastOpenedJudgment } from './folioModel';

// The reverse of the folio line: from a saved passage, not from the article.
//
// Folio asks whether this *source* speaks to a claim you hold. This door asks
// whether *this passage* was filed as Why or Against. If it was never filed,
// the same sentence match as the library inbox may still offer Why / Against —
// only when the passage covers the hold, never leftover-word soup. Graph edges
// and a source-ref on the ledger are not enough. Silence is the honest answer
// when it does not match.

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const idOf = (value) => clean(value?._id || value?.id || value);
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

const recency = (page) => time(page?.updatedAt || page?.judgment?.lastReviewedAt || page?.createdAt);

/** Same origin the library inbox files, so the whisper can find it after. */
export const passageOrigin = (articleId, highlightId) => {
  const article = clean(articleId);
  const highlight = clean(highlightId);
  return article && highlight ? `highlight:${article}:${highlight}` : '';
};

const STANCE = {
  why: 'Why',
  against: 'Against'
};

const stanceName = (field) => {
  switch (field) {
    case 'why':
      return STANCE.why;
    case 'against':
      return STANCE.against;
    default:
      return '';
  }
};

const lineTouchesPassage = (line, highlightId, articleId) => {
  const origin = parseSourceOrigin(line?.acceptedFrom);
  if (!origin.highlightId || !idsMatch(origin.highlightId, highlightId)) return false;
  if (articleId && origin.articleId && !idsMatch(origin.articleId, articleId)) return false;
  return true;
};

const filedHits = (pages, highlightId, articleId) => {
  const hits = [];
  list(pages).forEach((page) => {
    if (!isJudgmentPage(page) || !folioSentence(page)) return;
    ['why', 'against'].forEach((field) => {
      list(page?.judgment?.[field]).forEach((line) => {
        if (!lineTouchesPassage(line, highlightId, articleId)) return;
        hits.push({
          page,
          field,
          at: time(line?.createdAt) || recency(page)
        });
      });
    });
  });
  return hits;
};

const pickHit = (hits, { preferredId, recentlyOpenedId }) => {
  if (!hits.length) return null;

  const pages = [];
  const seen = new Set();
  hits.forEach((hit) => {
    const id = idOf(hit.page);
    if (!id || seen.has(id)) return;
    seen.add(id);
    pages.push(hit.page);
  });

  const preferred = pages.find((page) => idsMatch(page, preferredId));
  const recent = pages.find((page) => idsMatch(page, recentlyOpenedId));
  const kept = pages.filter((page) => page?.evergreen);
  const pool = preferred
    ? [preferred]
    : recent
      ? [recent]
      : (kept.length ? kept : pages);
  const picked = pool.slice().sort((left, right) => recency(right) - recency(left))[0];
  if (!picked) return null;

  return hits
    .filter((hit) => idsMatch(hit.page, picked))
    .sort((left, right) => right.at - left.at)[0] || null;
};

/**
 * One door from a filed passage back to the claim, or null.
 * Why / Against / silence — never a list, never a related neighbour.
 */
export const pickPassageDoor = (pages, {
  highlightId = '',
  articleId = '',
  preferredId = '',
  recentlyOpenedId = ''
} = {}) => {
  const id = clean(highlightId);
  if (!id) return null;

  const hit = pickHit(filedHits(pages, id, clean(articleId)), {
    preferredId: clean(preferredId),
    recentlyOpenedId: clean(recentlyOpenedId) || lastOpenedJudgment()
  });
  if (!hit) return null;

  const text = folioSentence(hit.page);
  const href = folioHref(hit.page);
  const stance = stanceName(hit.field);
  if (!text || !href || !stance) return null;
  return {
    id: idOf(hit.page),
    text,
    href,
    stance
  };
};

const unfiledHits = (pages, passage) => {
  const hits = [];
  list(pages).forEach((page) => {
    if (!isJudgmentPage(page)) return;
    const claim = folioSentence(page);
    if (!claim) return;
    if (!answersHeldSentence(passage, claim).ok) return;
    hits.push({ page, at: recency(page) });
  });
  return hits;
};

/**
 * One unfiled claim this passage covers, or null.
 * Same matcher as the inbox under a claim. Not a list, not a leftover word.
 */
export const pickUnfiledPassageMatch = (pages, {
  highlightId = '',
  articleId = '',
  text = '',
  preferredId = '',
  recentlyOpenedId = ''
} = {}) => {
  const id = clean(highlightId);
  const article = clean(articleId);
  const passage = clean(text);
  const origin = passageOrigin(article, id);
  if (!id || !article || !passage || !origin) return null;
  if (pickPassageDoor(pages, {
    highlightId: id,
    articleId: article,
    preferredId,
    recentlyOpenedId
  })) return null;

  const hit = pickHit(unfiledHits(pages, passage), {
    preferredId: clean(preferredId),
    recentlyOpenedId: clean(recentlyOpenedId) || lastOpenedJudgment()
  });
  if (!hit) return null;

  const claim = folioSentence(hit.page);
  const href = folioHref(hit.page);
  if (!claim || !href) return null;
  return {
    id: idOf(hit.page),
    text: claim,
    href,
    origin
  };
};
