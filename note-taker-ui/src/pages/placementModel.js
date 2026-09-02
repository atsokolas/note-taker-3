/*
 * Where a source lives.
 *
 * Keep is forever and orthogonal. Placement is the Hey pile: in the Imbox,
 * owed a move, or at hand this week. Missing placement is the stream.
 */

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export const PLACEMENT_STREAM = 'stream';
export const PLACEMENT_LATER = 'later';
export const PLACEMENT_SET_ASIDE = 'setAside';

const PLACEMENTS = new Set([PLACEMENT_STREAM, PLACEMENT_LATER, PLACEMENT_SET_ASIDE]);

export const normalizePlacement = (value) => {
  const candidate = clean(value);
  if (!candidate) return PLACEMENT_STREAM;
  return PLACEMENTS.has(candidate) ? candidate : '';
};

export const placementOf = (article = {}) => {
  const placement = normalizePlacement(article?.placement);
  return placement || PLACEMENT_STREAM;
};

export const isParked = (article = {}) => {
  const placement = placementOf(article);
  return placement === PLACEMENT_LATER || placement === PLACEMENT_SET_ASIDE;
};

const folderAsFeed = (article = {}) => article?.folder?.asFeed === true;

export const isFeedArticle = (article = {}) => !isParked(article) && folderAsFeed(article);

export const isImboxArticle = (article = {}) => !isParked(article) && !folderAsFeed(article);

export const isLaterArticle = (article = {}) => placementOf(article) === PLACEMENT_LATER;
export const isSetAsideArticle = (article = {}) => placementOf(article) === PLACEMENT_SET_ASIDE;

const time = (value) => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(at) ? 0 : at;
};

const parkedAt = (article = {}) => article.placementAt || article.updatedAt || article.createdAt || null;

export const orderLaterOldestFirst = (articles = []) => (Array.isArray(articles) ? articles : [])
  .filter(isLaterArticle)
  .sort((left, right) => time(parkedAt(left)) - time(parkedAt(right)));

export const orderSetAsideNewestFirst = (articles = []) => (Array.isArray(articles) ? articles : [])
  .filter(isSetAsideArticle)
  .sort((left, right) => time(parkedAt(right)) - time(parkedAt(left)));

const MONTH = { month: 'long', year: 'numeric' };

const oldestParked = (articles = []) => {
  if (!articles.length) return null;
  return [...articles].sort((left, right) => time(parkedAt(left)) - time(parkedAt(right)))[0];
};

const oldestSince = (article, now) => {
  const since = time(parkedAt(article));
  if (!since) return '';
  const days = Math.floor((now - since) / (24 * 60 * 60 * 1000));
  if (days < 14) return '';
  return `oldest since ${new Date(since).toLocaleDateString(undefined, MONTH)}`;
};

export const laterPileLine = (articles = [], now = Date.now()) => {
  const pile = orderLaterOldestFirst(articles);
  if (!pile.length) return '';
  const count = pile.length === 1 ? 'One thing' : `${pile.length} things`;
  const since = oldestSince(pile[0], now);
  return since ? `${count} owed a move. The ${since}.` : `${count} owed a move.`;
};

export const setAsidePileLine = (articles = [], now = Date.now()) => {
  const pile = orderSetAsideNewestFirst(articles);
  if (!pile.length) return '';
  const count = pile.length === 1 ? 'One thing' : `${pile.length} things`;
  const since = oldestSince(oldestParked(pile), now);
  return since ? `${count} at hand · ${since}` : `${count} at hand.`;
};

export const articleIdOfSource = (source = {}) => {
  const type = String(source?.type || source?.source?.type || '');
  const row = source?.source || source;
  if (type === 'highlight' || row.type === 'highlight') {
    return String(row.parentId || row.parent?.id || '').trim();
  }
  if (type === 'article' || row.type === 'article' || row._id || row.id) {
    return String(row.id || row._id || '').trim();
  }
  return '';
};

export const isImboxSource = (source = {}, articlesById = new Map()) => {
  const articleId = articleIdOfSource(source);
  if (!articleId) return true;
  const article = articlesById.get(articleId);
  if (!article) return true;
  return isImboxArticle(article);
};

export const idOfArticle = (article = {}) => String(article?._id || article?.id || '').trim();

export const articlesById = (articles = []) => {
  const map = new Map();
  (Array.isArray(articles) ? articles : []).forEach((article) => {
    const id = idOfArticle(article);
    if (id) map.set(id, article);
  });
  return map;
};

export const mergeArticles = (...groups) => {
  const map = new Map();
  groups.flat().forEach((article) => {
    const id = idOfArticle(article);
    if (!id) return;
    map.set(id, { ...map.get(id), ...article });
  });
  return [...map.values()];
};
