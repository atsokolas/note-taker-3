import { normalizeSpaces } from '../utils/editorialText';

/*
 * What you keep.
 *
 * The rest of the product is measured against a clock: what changed overnight,
 * what has gone unread, what is drifting. Some reading is not like that. It is
 * held for life, and the only thing it needs from software is to still be
 * there — findable, and never counted as neglected.
 *
 * Evergreen is the one flag in Noeis that the human sets and no agent may. It
 * spans the three things worth keeping: a source you read, a page you built,
 * and a belief you hold.
 */

const idOf = value => String(value?._id || value?.id || value || '');
const time = value => new Date(value || 0).getTime();
const list = value => (Array.isArray(value) ? value : []);

export const EVERGREEN_KINDS = Object.freeze(['source', 'page', 'judgment']);

const isJudgment = (page = {}) => {
  const judgment = page?.judgment || {};
  return Boolean(normalizeSpaces(judgment.currentJudgment) || normalizeSpaces(judgment.governingQuestion));
};

/**
 * When a kept belief stopped being held.
 *
 * A check-in retires a claim, not a page, so a page speaks for itself only
 * once every claim on it has been retired — one surviving claim means the
 * belief still stands. A page carrying no claims has nothing to check in and
 * is never struck; neither is a source, which has no check-in at all.
 */
const retiredInstant = (page = {}) => {
  const claims = list(page.claims);
  if (!claims.length) return null;
  const stamps = [];
  for (const claim of claims) {
    const retired = normalizeSpaces(claim?.checkInStatus) === 'retired' || Boolean(claim?.retiredAt);
    if (!retired) return null;
    if (claim?.retiredAt) stamps.push(claim.retiredAt);
  }
  // The belief went when the last of its claims did.
  return stamps.sort().pop() || null;
};

const sourceEntry = (article = {}) => ({
  id: `source:${idOf(article)}`,
  kind: 'source',
  targetId: idOf(article),
  title: normalizeSpaces(article.title) || 'Untitled source',
  detail: normalizeSpaces(article.siteName || article.author),
  url: normalizeSpaces(article.url),
  keptAt: article.evergreenAt || article.updatedAt || article.createdAt || null,
  retiredAt: null
});

const pageEntry = (page = {}) => {
  const judgment = isJudgment(page);
  return {
    id: `${judgment ? 'judgment' : 'page'}:${idOf(page)}`,
    kind: judgment ? 'judgment' : 'page',
    targetId: idOf(page),
    title: judgment
      ? (normalizeSpaces(page?.judgment?.currentJudgment) || normalizeSpaces(page?.judgment?.governingQuestion) || normalizeSpaces(page.title))
      : (normalizeSpaces(page.title) || 'Untitled page'),
    detail: judgment ? normalizeSpaces(page.title) : '',
    url: '',
    keptAt: page.evergreenAt || page.updatedAt || page.createdAt || null,
    /* Errata. A belief you retired is still a thing you decided to keep, so it
       stays on the shelf struck through rather than being quietly removed —
       a canon that edits itself is not a record of anything. */
    retiredAt: judgment ? retiredInstant(page) : null
  };
};

/**
 * Everything the reader has kept, newest decision first.
 *
 * The order is when you decided to keep it, not when you last touched it —
 * a canon reads best in the order it was built.
 */
export const buildEvergreenIndex = ({ articles = [], pages = [] } = {}) => [
  ...list(articles).filter(article => article?.evergreen).map(sourceEntry),
  ...list(pages).filter(page => page?.evergreen).map(pageEntry)
]
  .filter(entry => entry.targetId && entry.title)
  .sort((left, right) => (time(right.keptAt) || 0) - (time(left.keptAt) || 0));

/*
 * The canon reads the other way round.
 *
 * Every other list in this product is newest first, because everything else is
 * about what changed. This one is oldest first: the thing you have held
 * longest leads, and the newest arrival is at the foot waiting to earn its
 * place. That is what a canon is, and it is the only list here that reads like
 * one.
 */
/**
 * The day a thing was decided on, whether it arrives as an article off the
 * shelf query or as an entry out of the index. Never the day it was last
 * touched: a canon reads in the order it was built, and re-reading something
 * does not move it.
 */
const keptInstant = (item = {}) => time(item.keptAt || item.evergreenAt || item.createdAt);

export const orderKeptOldestFirst = (items = []) => list(items)
  // An index entry has already earned its place and carries a kind; a raw
  // article has to say it was kept.
  .filter(item => item?.kind || item?.evergreen)
  .sort((left, right) => (keptInstant(left) || 0) - (keptInstant(right) || 0));

const MONTH = { month: 'long', year: 'numeric' };

/**
 * What the shelf says about itself: how many, and how long the oldest has been
 * there. The product noticing out loud, which is the only thing this shelf is
 * for — it has nothing to ask you.
 */
export const keptShelfLine = (items = [], now = Date.now()) => {
  const kept = orderKeptOldestFirst(items);
  if (!kept.length) return '';
  const count = kept.length === 1 ? 'One thing' : `${kept.length} things`;
  const since = keptInstant(kept[0]);
  if (Number.isNaN(since) || !since) return `${count} you decided to keep.`;
  const days = Math.floor((now - since) / (24 * 60 * 60 * 1000));
  if (days < 14) return `${count} you decided to keep. The first one this month.`;
  return `${count} you decided to keep. The oldest since ${new Date(since).toLocaleDateString(undefined, MONTH)}.`;
};

export const evergreenHref = (entry = {}) => {
  if (entry.kind === 'source') return `/library?article=${entry.targetId}`;
  if (entry.kind === 'judgment') return `/judgment/${entry.targetId}`;
  return `/wiki/${entry.targetId}`;
};

export const EVERGREEN_KIND_LABEL = Object.freeze({
  source: 'Something you read',
  page: 'A page you built',
  judgment: 'A belief you hold'
});

/** The word on the control, which says what pressing it will do. */
export const evergreenToggleLabel = (evergreen = false) => (evergreen ? 'Kept' : 'Keep this');
