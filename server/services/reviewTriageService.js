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
const reviewTimestamp = page => Math.max(
  time(page?.freshness?.lastSourceEventAt),
  time(page?.freshness?.lastReviewedAt),
  time(page?.updatedAt),
  time(page?.createdAt)
);
// The browser fallback mirrors this lifecycle contract; both suites carry the
// same revival fixture so an expiry cannot outlive newer source activity.
const reviewExpired = (page, now = Date.now()) => {
  if (page?.lastVisitedAt || isJudgmentPage(page)) return false;
  const expiredAt = time(page?.freshness?.reviewExpiredAt);
  const activityAt = reviewTimestamp(page);
  if (expiredAt && expiredAt >= activityAt) return true;
  return isLowStakesPage(page)
    && activityAt > 0
    && now - activityAt >= LOW_STAKES_REVIEW_TTL_DAYS * DAY_MS;
};
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

const formatReviewTriageFrame = ({ promotedCount = 0, minorCount = 0 } = {}) => {
  const promoted = Math.max(0, Number(promotedCount) || 0);
  const minor = Math.max(0, Number(minorCount) || 0);
  if (!promoted && !minor) return '';
  if (!promoted) return `${minor} minor`;
  if (!minor) return `${promoted} worth your attention`;
  return `${promoted} worth your attention · ${minor} minor`;
};

const buildReviewTriage = ({
  pages = [],
  now = Date.now(),
  limit = REVIEW_PROMOTION_LIMIT,
  assumeNeedsReview = false
} = {}) => {
  const candidates = assumeNeedsReview ? list(pages) : list(pages).filter(needsReview);
  const active = candidates.filter(page => !reviewExpired(page, now)).sort(compareRank);
  const promoted = active.slice(0, Math.max(0, limit)).map(page => ({
    pageId: id(page),
    title: String(page?.title || 'Untitled wiki page'),
    reason: reviewReason(page),
    href: `/wiki/workspace?page=${encodeURIComponent(id(page))}`
  }));
  const promotedCount = promoted.length;
  const minorCount = Math.max(0, active.length - promoted.length);
  return {
    promoted,
    promotedCount,
    minorCount,
    expiredCount: candidates.length - active.length,
    totalCount: active.length,
    frame: formatReviewTriageFrame({ promotedCount, minorCount }),
    policy: `Low-stakes repo, edition, system, and agent-process reviews expire after ${LOW_STAKES_REVIEW_TTL_DAYS} unvisited days.`
  };
};

const expireLowStakesReviews = async ({
  WikiPage,
  pages = [],
  userId,
  now = Date.now()
} = {}) => {
  const expiredIds = list(pages)
    .filter(page => needsReview(page) && reviewExpired(page, now) && !page?.freshness?.reviewExpiredAt)
    .map(page => page?._id || page?.id)
    .filter(Boolean);
  if (!expiredIds.length || typeof WikiPage?.updateMany !== 'function') return 0;
  await WikiPage.updateMany(
    {
      ...(userId ? { userId } : {}),
      _id: { $in: expiredIds }
    },
    { $set: { 'freshness.reviewExpiredAt': new Date(now) } },
    { timestamps: false }
  );
  return expiredIds.length;
};

module.exports = {
  LOW_STAKES_REVIEW_TTL_DAYS,
  REVIEW_PROMOTION_LIMIT,
  buildReviewTriage,
  compareRank,
  expireLowStakesReviews,
  formatReviewTriageFrame,
  isJudgmentPage,
  isLowStakesPage,
  needsReview,
  reviewExpired,
  reviewReason
};
