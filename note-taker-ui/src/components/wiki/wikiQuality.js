export const HEALTH_LABELS = {
  newItems: 'new source signals',
  unsupportedClaims: 'unsupported claims',
  missingCitations: 'missing citations',
  staleSections: 'stale sections',
  contradictions: 'contradictions'
};

const DRIFT_HEALTH_KEYS = new Set(['newItems', 'staleSections']);
const REVIEW_HEALTH_KEYS = new Set(['unsupportedClaims', 'missingCitations', 'contradictions']);

export const normalizeQualityIssueText = (issue = '') => {
  if (typeof issue === 'string') return issue.trim();
  if (!issue || typeof issue !== 'object') return '';
  return String(issue.text || issue.message || issue.summary || issue.title || issue.reason || '').trim();
};

export const collectQualityIssues = (page = {}) => {
  const aiState = page?.aiState || {};
  const health = aiState.health || {};
  const healthIssues = Object.entries(HEALTH_LABELS).flatMap(([key, label]) => {
    const items = Array.isArray(health[key]) ? health[key] : [];
    return items.map((item) => ({
      key,
      label,
      text: normalizeQualityIssueText(item)
    }));
  });
  const explicitIssueSources = [
    page?.qualityIssues,
    page?.quality?.issues,
    page?.quality?.failures,
    page?.quality?.qualityIssues,
    aiState?.qualityIssues,
    aiState?.quality?.issues,
    aiState?.quality?.failures,
    aiState?.maintenanceQualityIssues
  ];
  const explicitIssues = explicitIssueSources
    .filter(Array.isArray)
    .flatMap(issues => issues.map((issue) => ({
      key: 'qualityIssues',
      label: 'quality issues',
      text: normalizeQualityIssueText(issue)
    })));
  return [...explicitIssues, ...healthIssues].filter(issue => issue.text || issue.label);
};

const claimHealthCounts = (claims = []) => claims.reduce((counts, claim) => {
  const support = String(claim?.support || claim?.supportStatus || claim?.status || '').toLowerCase();
  if (support === 'supported') counts.supported += 1;
  else if (support === 'partial' || support === 'partially_supported') counts.partial += 1;
  else if (support === 'conflicted' || support === 'contradicted') counts.conflicted += 1;
  else if (support === 'unsupported') counts.unsupported += 1;
  return counts;
}, { supported: 0, partial: 0, unsupported: 0, conflicted: 0 });

export const buildQualityState = ({ page = {}, counts = {} }) => {
  const claims = Array.isArray(page?.claims) ? page.claims : [];
  const resolvedCounts = Object.keys(counts || {}).length ? counts : claimHealthCounts(claims);
  const issues = collectQualityIssues(page);
  const qualityStatus = String(page?.aiState?.quality?.status || page?.quality?.status || '').toLowerCase();
  const explicitNeedsRebuild = ['needs_rebuild', 'fail', 'failed'].includes(qualityStatus);
  const explicitNeedsReview = ['needs_review', 'review', 'warning'].includes(qualityStatus);
  const weakClaimCount = (resolvedCounts.partial || 0) + (resolvedCounts.unsupported || 0) + (resolvedCounts.conflicted || 0);
  const weakClaimRatio = claims.length ? weakClaimCount / claims.length : 0;
  const missingSourceEvidence = claims.length > 0 && !(page?.sourceRefs || []).length;
  const weakClaimHealth = weakClaimCount > 0 && (weakClaimRatio >= 0.34 || (resolvedCounts.unsupported || 0) + (resolvedCounts.conflicted || 0) > 0);
  const severeIssue = explicitNeedsRebuild
    || missingSourceEvidence
    || issues.some(issue => /scaffold|placeholder|too thin|source dump|missing source/i.test(issue.text || issue.label || ''));
  const reviewIssue = explicitNeedsReview
    || weakClaimHealth
    || issues.some(issue => REVIEW_HEALTH_KEYS.has(issue.key));
  const driftIssue = issues.some(issue => DRIFT_HEALTH_KEYS.has(issue.key));
  if (!severeIssue && !reviewIssue && !driftIssue) return null;

  const severity = severeIssue ? 'rebuild' : reviewIssue ? 'review' : 'drift';
  const title = {
    rebuild: 'Needs rebuild',
    review: 'Needs review',
    drift: 'Drifting'
  }[severity];
  const summary = {
    rebuild: 'The page has structural or evidence problems that can make the article misleading.',
    review: 'The article is usable, but weak claims or citation gaps should be reviewed.',
    drift: 'The article is usable, but new source or stale-section signals are waiting to be incorporated.'
  }[severity];
  const reasons = [
    ...issues
      .filter(issue => severity !== 'drift' || DRIFT_HEALTH_KEYS.has(issue.key))
      .slice(0, 3)
      .map(issue => issue.text || issue.label),
    missingSourceEvidence ? 'Claims have no attached sources.' : '',
    weakClaimHealth ? `${weakClaimCount} of ${claims.length} claim${claims.length === 1 ? '' : 's'} need stronger support.` : ''
  ].filter(Boolean);
  return {
    title,
    summary,
    severity,
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    issueCount: issues.length,
    weakClaimCount
  };
};
