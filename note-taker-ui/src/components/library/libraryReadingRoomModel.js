import {
  composeCruftSuppressionNotice,
  countSuppressedInCollection,
  filterReturnViewItems
} from '../../utils/cruftSuppression';

const normalizeName = (value) => String(value || '').trim();

export { composeCruftSuppressionNotice, countSuppressedInCollection };

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

const getRecencyTimestamp = (article) => {
  const value = article?.updatedAt || article?.createdAt;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const scoreReopenCandidate = (article) => {
  const highlightCount = getHighlightCount(article);
  const conceptCount = getConnectedConceptNames(article).length;
  const tagCount = Array.isArray(article?.tags) ? article.tags.length : 0;
  const recency = getRecencyTimestamp(article) / 1e11;
  return (highlightCount * 12) + (conceptCount * 8) + (tagCount * 4) + recency;
};

export const pickReopenCandidate = (articles = []) => {
  const pool = filterReturnViewItems(Array.isArray(articles) ? articles : []);
  const candidates = pool.filter((article) => article?._id && getHighlightCount(article) > 0);
  if (candidates.length === 0) {
    return pool.find((article) => article?._id) || null;
  }
  return [...candidates].sort((a, b) => scoreReopenCandidate(b) - scoreReopenCandidate(a))[0];
};

const formatConceptList = (names = []) => {
  const clean = names.map(normalizeName).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
};

export const composeReopenLead = (article) => {
  if (!article?._id) {
    return {
      articleId: '',
      title: '',
      headline: 'Your reading room is ready',
      detail: 'Save a source or import highlights to see what is worth reopening next.',
      conceptNames: []
    };
  }

  const title = normalizeName(article.title) || 'Untitled article';
  const highlightCount = getHighlightCount(article);
  const conceptNames = getConnectedConceptNames(article);
  const tagNames = Array.isArray(article?.tags)
    ? article.tags.map(normalizeName).filter(Boolean)
    : [];
  const pullTargets = conceptNames.length > 0 ? conceptNames : tagNames;
  const targetLabel = formatConceptList(pullTargets.slice(0, 3));

  let detail = '';
  if (highlightCount > 0 && targetLabel) {
    const highlightLabel = `${highlightCount} highlight${highlightCount === 1 ? '' : 's'}`;
    detail = `${highlightLabel} ${highlightCount === 1 ? 'is' : 'are'} now pulling toward ${targetLabel}.`;
  } else if (highlightCount > 0) {
    detail = `${highlightCount} saved highlight${highlightCount === 1 ? '' : 's'} are ready to reconnect with your active thinking.`;
  } else {
    detail = 'Recently saved and ready when you want to pick the thread back up.';
  }

  return {
    articleId: article._id,
    title,
    headline: `Reopen ${title}`,
    detail,
    conceptNames: pullTargets.slice(0, 3)
  };
};

export const buildMaintenanceSummary = ({
  allArticles = [],
  unfiledCount = 0,
  suppressedCount = 0
} = {}) => {
  const total = Array.isArray(allArticles) ? allArticles.length : 0;
  const unfiled = Number(unfiledCount) || 0;
  const filed = Math.max(0, total - unfiled);
  const readyToClassify = (Array.isArray(allArticles) ? allArticles : [])
    .filter((article) => !article?.folder && getHighlightCount(article) > 0).length;
  const cruftNotice = composeCruftSuppressionNotice(suppressedCount);
  const withCruftNotice = (summary) => (
    cruftNotice ? { ...summary, cruftNotice } : summary
  );

  if (total === 0) {
    return withCruftNotice({
      total,
      unfiled,
      filed,
      readyToClassify,
      status: 'empty',
      message: 'No saved sources yet. The reading room will surface reopen candidates once articles arrive.',
      actionLabel: ''
    });
  }

  if (unfiled === total) {
    return withCruftNotice({
      total,
      unfiled,
      filed,
      readyToClassify,
      status: 'unfiled',
      message: `${unfiled} source${unfiled === 1 ? '' : 's'} still unfiled. The corpus is readable, but filing suggestions are waiting.`,
      actionLabel: 'Review filing suggestions'
    });
  }

  if (unfiled > 0) {
    const classifyHint = readyToClassify > 0
      ? `${readyToClassify} unfiled source${readyToClassify === 1 ? '' : 's'} already have highlights ready to classify.`
      : `${unfiled} source${unfiled === 1 ? '' : 's'} still need a cabinet home.`;
    return withCruftNotice({
      total,
      unfiled,
      filed,
      readyToClassify,
      status: 'mixed',
      message: classifyHint,
      actionLabel: 'Review filing suggestions'
    });
  }

  return withCruftNotice({
    total,
    unfiled,
    filed,
    readyToClassify,
    status: 'filed',
    message: `${filed} source${filed === 1 ? '' : 's'} filed. The reading room stays focused on what to reopen next.`,
    actionLabel: ''
  });
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
