const normalizeName = (value) => String(value || '').trim();

export const getHighlightCount = (article) => (
  Number(article?.highlightCount ?? article?.highlights?.length ?? 0)
);

export const getConnectedConceptNames = (article) => {
  const names = new Set();
  if (Array.isArray(article?.concepts)) {
    article.concepts.forEach((item) => {
      const name = normalizeName(item?.name || item?.tag || item);
      if (name) names.add(name);
    });
  }
  if (Array.isArray(article?.conceptNames)) {
    article.conceptNames.forEach((name) => {
      const clean = normalizeName(name);
      if (clean) names.add(clean);
    });
  }
  return Array.from(names);
};

export const getArticleTags = (article) => {
  if (Array.isArray(article?.tags) && article.tags.length > 0) {
    return article.tags.map((tag) => normalizeName(tag)).filter(Boolean).slice(0, 3);
  }
  return getConnectedConceptNames(article).slice(0, 3);
};

const formatConceptList = (names = []) => {
  const clean = names.map(normalizeName).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
};

export const getWhyItMatters = (article, excerpt = '') => {
  const cleanExcerpt = normalizeName(excerpt);
  if (cleanExcerpt) return cleanExcerpt;

  const highlightCount = getHighlightCount(article);
  const concepts = getConnectedConceptNames(article);
  if (concepts.length > 0 && highlightCount > 0) {
    return `${highlightCount} highlight${highlightCount === 1 ? '' : 's'} linked to ${formatConceptList(concepts.slice(0, 2))}.`;
  }
  if (highlightCount > 0) {
    return `${highlightCount} saved highlight${highlightCount === 1 ? '' : 's'} waiting in the margin.`;
  }
  return '';
};

/* The reading room's words. The rules live on the server; these only say them. */

const pad = (value) => String(value).padStart(2, '0');

/** The Monday that starts this week, on the reader's own calendar. */
export const weekKey = (now = new Date()) => {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
};

/** Weather is a Monday thing, or the first visit of a week that began without you. */
export const showsWeather = ({ now = new Date(), seenWeek = '' } = {}) => (
  now.getDay() === 1 || seenWeek !== weekKey(now)
);

export const progressPhrase = (ratio) => {
  const value = Number(ratio);
  if (ratio == null || !Number.isFinite(value)) return '';
  if (value < 0.35) return 'a little way in';
  if (value < 0.65) return 'about halfway';
  return 'most of the way through';
};

const savedWhen = (savedAt, now) => {
  const date = savedAt ? new Date(savedAt) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const options = date.getFullYear() === now.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' };
  return date.toLocaleDateString(undefined, options);
};

export const pickLine = (pick = {}, now = new Date()) => {
  const when = savedWhen(pick.savedAt, now);
  const progress = progressPhrase(pick.ratio);
  if (progress) return when ? `Saved in ${when}. You are ${progress}.` : `You are ${progress}.`;
  return when ? `Saved in ${when}, not yet opened.` : 'Not yet opened.';
};
