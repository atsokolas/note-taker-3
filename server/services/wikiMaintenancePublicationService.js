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

const destructiveClaimLoss = ({ before = {}, candidate = {} } = {}) => {
  const beforeCount = Array.isArray(before.claims) ? before.claims.length : 0;
  const afterCount = Array.isArray(candidate.claims) ? candidate.claims.length : 0;
  return beforeCount >= 8 && afterCount < beforeCount * 0.6;
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
  rejectDestructiveClaimLoss = false,
  promoteEvidenceOnlyOnDestructiveLoss = false,
  requireManualReview = false,
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
  let quality = candidate.aiState?.quality || {};
  const passedBeforeDestructiveGuard = !candidateFailedQuality(candidate);
  const destructiveLossDetected = rejectDestructiveClaimLoss && destructiveClaimLoss({ before, candidate });
  if (destructiveLossDetected) {
    quality = {
      ...quality,
      ok: false,
      status: 'fail',
      failures: [
        ...(Array.isArray(quality.failures) ? quality.failures : []),
        'Candidate removed more than 40% of the trusted claim ledger; manual review is required.'
      ]
    };
    candidate.aiState = { ...(candidate.aiState || {}), quality };
  }
  if (requireManualReview) {
    quality = {
      ...quality,
      ok: false,
      status: 'fail',
      failures: [
        ...(Array.isArray(quality.failures) ? quality.failures : []),
        'Accepted public proof cannot be auto-published; explicit human acceptance is required.'
      ]
    };
    candidate.aiState = { ...(candidate.aiState || {}), quality };
  }
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
  if (promoteEvidenceOnlyOnDestructiveLoss && destructiveLossDetected && passedBeforeDestructiveGuard) {
    const priorAiState = asPlain(candidatePage.aiState);
    candidatePage.aiState = {
      ...priorAiState,
      draftStatus: 'ready',
      lastError: '',
      errorCode: '',
      candidateStatus: 'evidence_only',
      lastCandidateAt: now,
      lastCandidateQuality: quality,
      lastCandidateSummary: 'Reviewed the new source and preserved the trusted claim ledger because the generated rewrite was destructive.'
    };
    if (typeof candidatePage.markModified === 'function') candidatePage.markModified('aiState');
    return {
      page: candidatePage,
      before,
      candidate,
      quality,
      promoted: true,
      evidenceOnly: true,
      rejectedRevision
    };
  }
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
