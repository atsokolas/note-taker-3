const {
  createWikiRevision,
  restorePageSnapshot,
  snapshotContentHash,
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

const recordReviewCandidate = async ({
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
  promotionStatus: 'candidate',
  sourceVersion: {
    ...(sourceVersion || {}),
    trustedHeadHash: snapshotContentHash(before)
  },
  quality: candidate?.aiState?.quality || {},
  summary: summary || `Held first trusted-head candidate for "${candidate?.title || page?.title || 'page'}" for owner review.`
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
  hasTrustedVersion = null,
  rejectDestructiveClaimLoss = false,
  promoteEvidenceOnlyOnDestructiveLoss = false,
  requireManualReview = false,
  requireFirstHeadAcceptance = false,
  requireOwnerAcceptance = false,
  now = new Date()
} = {}) => {
  if (!page || typeof maintainWikiPageFn !== 'function') {
    throw new Error('Wiki candidate publication requires a page and maintenance function.');
  }
  const before = beforeSnapshot || snapshotPage(page);
  const isFreshCompanyDossier = /^company-dossier:/i.test(String(page?.createdFrom?.label || ''))
    && !before?.aiState?.lastDraftedAt
    && (!Array.isArray(before?.claims) || before.claims.length === 0);
  const trustedVersionAvailable = typeof hasTrustedVersion === 'boolean'
    ? hasTrustedVersion
    : !isFreshCompanyDossier;
  const resolvedMaintainArgs = { ...maintainArgs };
  const shouldResumeBestCandidate = Boolean(resolvedMaintainArgs.resumeFromBestCandidate);
  delete resolvedMaintainArgs.resumeFromBestCandidate;
  if (shouldResumeBestCandidate
    && !resolvedMaintainArgs.recoveryDraftText
    && typeof WikiRevision?.findOne === 'function') {
    const priorQuery = WikiRevision.findOne({
      userId,
      pageId: page._id,
      reason: 'agent_candidate',
      promotionStatus: 'rejected',
      'quality.ok': false,
      'after.plainText': { $exists: true, $ne: '' }
    });
    const sortedQuery = priorQuery?.sort
      ? priorQuery.sort({ 'quality.score': -1, createdAt: -1 })
      : priorQuery;
    const priorCandidate = await (sortedQuery?.lean ? sortedQuery.lean() : sortedQuery);
    if (priorCandidate?.after?.plainText) {
      resolvedMaintainArgs.recoveryDraftText = priorCandidate.after.plainText;
      resolvedMaintainArgs.recoveryDraftQuality = priorCandidate.quality || {};
    }
  }
  const maintainedPage = await maintainWikiPageFn({
    ...resolvedMaintainArgs,
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
  const awaitingFirstHead = requireFirstHeadAcceptance && isFreshCompanyDossier;
  if ((awaitingFirstHead || requireOwnerAcceptance) && !candidateFailedQuality(candidate)) {
    const reviewRevision = await recordReviewCandidate({
      WikiRevision,
      userId,
      page: candidatePage,
      before,
      candidate,
      sourceEventId,
      maintenanceRunId,
      sourceVersion
    });
    restorePageSnapshot(candidatePage, before);
    const priorAiState = asPlain(candidatePage.aiState);
    const reviewKind = awaitingFirstHead ? 'first_head' : 'maintenance';
    const revisionField = awaitingFirstHead ? 'firstHeadCandidateRevisionId' : 'maintenanceCandidateRevisionId';
    const atField = awaitingFirstHead ? 'firstHeadCandidateAt' : 'maintenanceCandidateAt';
    const summaryField = awaitingFirstHead ? 'firstHeadCandidateSummary' : 'maintenanceCandidateSummary';
    candidatePage.freshness = {
      ...asPlain(candidatePage.freshness),
      status: 'needs_review'
    };
    candidatePage.aiState = {
      ...priorAiState,
      draftStatus: 'ready',
      lastError: '',
      errorCode: '',
      candidateStatus: awaitingFirstHead
        ? 'awaiting_first_head_acceptance'
        : 'awaiting_maintenance_acceptance',
      [revisionField]: String(reviewRevision?._id || ''),
      [atField]: now,
      [summaryField]: {
        kind: reviewKind,
        title: candidate.title || candidatePage.title,
        wordCount: String(candidate.plainText || '').trim().split(/\s+/).filter(Boolean).length,
        claimCount: Array.isArray(candidate.claims) ? candidate.claims.length : 0,
        sourceCount: Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs.length : 0,
        quality: candidate.aiState?.quality || {}
      }
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
      awaitingAcceptance: true,
      reviewKind,
      reviewRevision
    };
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
    draftStatus: trustedVersionAvailable ? 'ready' : 'error',
    lastError: trustedVersionAvailable ? '' : `This dossier did not reach the evidence bar — ${candidateFailureSummary(quality)}`,
    errorCode: trustedVersionAvailable ? '' : 'WIKI_CANDIDATE_REJECTED',
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
  recordReviewCandidate,
  runWikiMaintenanceCandidate
};
