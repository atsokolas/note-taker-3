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

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const idOf = value => String(value?._id || value?.id || value || '');
const time = value => new Date(value || 0).getTime();
const list = value => (Array.isArray(value) ? value : []);

export const EVERGREEN_KINDS = Object.freeze(['source', 'page', 'judgment']);

const isJudgment = (page = {}) => {
  const judgment = page?.judgment || {};
  return Boolean(clean(judgment.currentJudgment) || clean(judgment.governingQuestion));
};

const sourceEntry = (article = {}) => ({
  id: `source:${idOf(article)}`,
  kind: 'source',
  targetId: idOf(article),
  title: clean(article.title) || 'Untitled source',
  detail: clean(article.siteName || article.author),
  url: clean(article.url),
  keptAt: article.evergreenAt || article.updatedAt || article.createdAt || null
});

const pageEntry = (page = {}) => {
  const judgment = isJudgment(page);
  return {
    id: `${judgment ? 'judgment' : 'page'}:${idOf(page)}`,
    kind: judgment ? 'judgment' : 'page',
    targetId: idOf(page),
    title: judgment
      ? (clean(page?.judgment?.currentJudgment) || clean(page?.judgment?.governingQuestion) || clean(page.title))
      : (clean(page.title) || 'Untitled page'),
    detail: judgment ? clean(page.title) : '',
    url: '',
    keptAt: page.evergreenAt || page.updatedAt || page.createdAt || null
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
