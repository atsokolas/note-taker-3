const REVIEW_PROMOTION_LIMIT = 3;
const LOW_STAKES_REVIEW_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const id = value => String(value?._id || value?.id || value || '');
const list = value => Array.isArray(value) ? value : [];
const time = value => new Date(value || 0).getTime() || 0;

const driftCount = page => list(page?.freshness?.pendingSourceEventIds).filter(Boolean).length;
const isJudgmentPage = page => Boolean(
  page?.judgment?.kind
  || String(page?.judgment?.currentJudgment || '').trim()
  || page?.activeCompanyDossierKey
  || page?.investmentDossier
);
const isLowStakesPage = page => {
  const createdType = String(page?.createdFrom?.type || '').toLowerCase();
  const label = String(page?.createdFrom?.label || '').toLowerCase();
  return createdType === 'github_repo'
    || createdType === 'research_edition'
    || /(?:repo wiki|this week in ai|system|acceptance|agent process)/i.test(`${page?.title || ''} ${label}`);
};
const reviewTimestamp = page => time(
  page?.freshness?.lastSourceEventAt
  || page?.freshness?.lastReviewedAt
  || page?.updatedAt
  || page?.createdAt
);
const reviewExpired = (page, now = Date.now()) => (
  isLowStakesPage(page)
  && !page?.lastVisitedAt
  && reviewTimestamp(page) > 0
  && now - reviewTimestamp(page) >= LOW_STAKES_REVIEW_TTL_DAYS * DAY_MS
);
const needsReview = page => {
  const status = String(page?.qualityReview?.status || page?.freshness?.status || '').toLowerCase();
  const candidate = String(page?.aiState?.candidateStatus || '').toLowerCase();
  return driftCount(page) > 0
    || status === 'needs_review'
    || status === 'conflicted'
    || candidate.startsWith('awaiting_');
};

const reviewReason = page => {
  if (isJudgmentPage(page)) return 'Judgment page · owner decision at stake';
  if (page?.lastVisitedAt) return 'Frequently used page · review affects active work';
  const drift = driftCount(page);
  if (drift) return `${drift} new source signal${drift === 1 ? '' : 's'}`;
  return 'Material review available';
};

const rankTuple = page => [
  isJudgmentPage(page) ? 1 : 0,
  time(page?.lastVisitedAt),
  driftCount(page),
  reviewTimestamp(page),
  id(page)
];
const compareRank = (left, right) => {
  const a = rankTuple(left);
  const b = rankTuple(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    return a[index] > b[index] ? -1 : 1;
  }
  return 0;
};

const buildReviewTriage = ({ pages = [], now = Date.now(), limit = REVIEW_PROMOTION_LIMIT } = {}) => {
  const candidates = list(pages).filter(needsReview);
  const active = candidates.filter(page => !reviewExpired(page, now)).sort(compareRank);
  const promoted = active.slice(0, Math.max(0, limit)).map(page => ({
    pageId: id(page),
    title: String(page?.title || 'Untitled wiki page'),
    reason: reviewReason(page),
    href: `/wiki/workspace?page=${encodeURIComponent(id(page))}`
  }));
  return {
    promoted,
    promotedCount: promoted.length,
    minorCount: Math.max(0, active.length - promoted.length),
    expiredCount: candidates.length - active.length,
    totalCount: active.length,
    policy: `Low-stakes repo, edition, system, and agent-process reviews expire after ${LOW_STAKES_REVIEW_TTL_DAYS} unvisited days.`
  };
};

module.exports = {
  LOW_STAKES_REVIEW_TTL_DAYS,
  REVIEW_PROMOTION_LIMIT,
  buildReviewTriage,
  compareRank,
  isLowStakesPage,
  needsReview,
  reviewExpired,
  reviewReason
};
