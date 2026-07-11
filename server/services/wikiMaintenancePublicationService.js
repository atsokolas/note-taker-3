const {
  createWikiRevision,
  restorePageSnapshot,
  snapshotPage
} = require('./wikiRevisionService');

const asPlain = (value = {}) => (
  value && typeof value.toObject === 'function'
    ? value.toObject({ virtuals: false })
    : JSON.parse(JSON.stringify(value || {}))
);

const candidateFailedQuality = (page = {}) => {
  const quality = page.aiState?.quality || {};
  return quality.ok === false || quality.status === 'fail';
};

const candidateFailureSummary = (quality = {}) => {
  const failures = Array.isArray(quality.failures) ? quality.failures.filter(Boolean) : [];
  return failures.length
    ? failures.slice(0, 4).join(' ')
    : 'The candidate did not pass the wiki quality contract.';
};

const recordRejectedCandidate = async ({
  WikiRevision,
  userId,
  page,
  before,
  candidate,
  sourceEventId = null,
  maintenanceRunId = null,
  sourceVersion = null,
  summary = ''
} = {}) => createWikiRevision({
  WikiRevision,
  userId,
  page,
  before,
  after: candidate,
  reason: 'agent_candidate',
  actorType: 'agent',
  sourceEventId,
  maintenanceRunId,
  promotionStatus: 'rejected',
  sourceVersion,
  quality: candidate?.aiState?.quality || {},
  summary: summary || `Rejected wiki candidate for "${candidate?.title || page?.title || 'page'}".`
});

const runWikiMaintenanceCandidate = async ({
  page,
  userId,
  maintainWikiPageFn,
  maintainArgs = {},
  beforeSnapshot = null,
  WikiRevision = null,
  sourceEventId = null,
  maintenanceRunId = null,
  sourceVersion = null,
  hasTrustedVersion = true,
  now = new Date()
} = {}) => {
  if (!page || typeof maintainWikiPageFn !== 'function') {
    throw new Error('Wiki candidate publication requires a page and maintenance function.');
  }
  const before = beforeSnapshot || snapshotPage(page);
  const maintainedPage = await maintainWikiPageFn({
    ...maintainArgs,
    page,
    userId
  });
  const candidatePage = maintainedPage || page;
  const candidate = snapshotPage(candidatePage);
  const quality = candidate.aiState?.quality || {};
  if (!candidateFailedQuality(candidate)) {
    return {
      page: candidatePage,
      before,
      candidate,
      quality,
      promoted: true,
      rejectedRevision: null
    };
  }

  const rejectedRevision = await recordRejectedCandidate({
    WikiRevision,
    userId,
    page: candidatePage,
    before,
    candidate,
    sourceEventId,
    maintenanceRunId,
    sourceVersion,
    summary: candidateFailureSummary(quality)
  });
  restorePageSnapshot(candidatePage, before);
  const priorAiState = asPlain(candidatePage.aiState);
  const priorFreshness = asPlain(candidatePage.freshness);
  candidatePage.freshness = {
    ...priorFreshness,
    status: 'needs_review'
  };
  candidatePage.aiState = {
    ...priorAiState,
    draftStatus: hasTrustedVersion ? 'ready' : 'error',
    lastError: hasTrustedVersion ? '' : 'The first wiki candidate did not pass the quality contract.',
    errorCode: hasTrustedVersion ? '' : 'WIKI_CANDIDATE_REJECTED',
    candidateStatus: 'rejected',
    lastCandidateAt: now,
    lastCandidateQuality: quality,
    lastCandidateSummary: candidateFailureSummary(quality)
  };
  if (typeof candidatePage.markModified === 'function') {
    candidatePage.markModified('freshness');
    candidatePage.markModified('aiState');
  }
  return {
    page: candidatePage,
    before,
    candidate,
    quality,
    promoted: false,
    rejectedRevision
  };
};

module.exports = {
  candidateFailedQuality,
  runWikiMaintenanceCandidate
};
