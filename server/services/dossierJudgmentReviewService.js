const {
  persistNoeisReceipt,
  sanitizeReceiptForStorage,
  serializeStoredReceipt
} = require('./noeisReceiptService');

const clean = (value = '', limit = 600) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const id = value => clean(value?._id || value?.id || value, 100);
const list = value => Array.isArray(value) ? value : [];
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const recordedResponse = draft => {
  const value = plain(draft);
  if (!value?.response) return null;
  return {
    response: clean(value.response, 32),
    proposedView: clean(value.proposedView, 8000),
    reason: clean(value.reason, 4000),
    action: clean(value.action, 32),
    proposedAction: clean(value.proposedAction, 4000),
    baseClaim: clean(value.baseClaim, 8000),
    criterionSnapshot: {
      text: clean(value.criterionSnapshot?.text, 2000),
      horizonAt: value.criterionSnapshot?.horizonAt || null,
      setAt: value.criterionSnapshot?.setAt || null,
      receiptId: clean(value.criterionSnapshot?.receiptId, 240),
      claimHash: clean(value.criterionSnapshot?.claimHash, 128)
    },
    draftVersion: Math.max(1, Number(value.version) || 1)
  };
};

const conditionAtAcceptance = (page, now) => {
  const acceptedAt = new Date(now || 0).getTime();
  const version = list(page?.judgment?.resolutionHistory)
    .filter(entry => new Date(entry?.setAt || 0).getTime() <= acceptedAt)
    .sort((left, right) => new Date(left?.setAt || 0) - new Date(right?.setAt || 0))
    .at(-1);
  if (!version) {
    return {
      text: clean(page?.judgment?.resolutionCriteria, 2000),
      horizonAt: page?.judgment?.resolutionHorizonAt || null,
      setAt: page?.judgment?.resolutionSetAt || null,
      receiptId: '',
      claimHash: ''
    };
  }
  return {
    text: clean(version.criteria, 2000),
    horizonAt: version.horizonAt || null,
    setAt: version.setAt || null,
    receiptId: clean(version.receiptId, 240),
    claimHash: clean(version.claimHash, 128)
  };
};

class DossierJudgmentReviewError extends Error {
  constructor(message, statusCode = 409, code = 'DOSSIER_JUDGMENT_REVIEW_INVALID') {
    super(message);
    this.name = 'DossierJudgmentReviewError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const compactComparison = (comparison = {}) => ({
  headline: clean(comparison.headline),
  summary: clean(comparison.summary),
  sourceLabel: clean(comparison.sourceLabel, 160),
  counts: comparison.counts && typeof comparison.counts === 'object' ? comparison.counts : {},
  claimChanges: (Array.isArray(comparison.claimChanges) ? comparison.claimChanges : [])
    .slice(0, 6)
    .map(change => ({
      kind: clean(change?.kind, 40),
      section: clean(change?.section, 160),
      title: clean(change?.title, 240),
      detail: clean(change?.detail),
      whyItMatters: clean(change?.whyItMatters)
    })),
  expectations: {
    status: clean(comparison.expectations?.status, 40),
    title: clean(comparison.expectations?.title, 240),
    summary: clean(comparison.expectations?.summary)
  }
});

const buildDossierJudgmentReviewReceipt = ({
  page,
  comparison,
  candidateRevisionId,
  acceptanceRevisionId,
  now = new Date()
} = {}) => {
  const pageId = id(page);
  const candidateId = id(candidateRevisionId);
  const judgment = clean(page?.judgment?.currentJudgment);
  if (!pageId || !candidateId || !page?.judgment?.kind || !judgment) return null;
  const acceptedComparison = compactComparison(comparison);
  const ticker = clean(page?.investmentDossier?.company?.ticker, 32);
  return {
    id: `company-dossier-judgment-review:${pageId}:${candidateId}`,
    kind: 'company_dossier_judgment_review',
    source: 'wiki',
    sourceLabel: acceptedComparison.sourceLabel || 'Accepted dossier research',
    status: 'awaiting_review',
    title: `Review what changed for ${ticker || clean(page.title, 160)}`,
    summary: acceptedComparison.headline || 'Accepted dossier research may bear on the current judgment.',
    metrics: acceptedComparison.counts,
    provenance: {
      pageId,
      candidateRevisionId: candidateId,
      acceptanceRevisionId: id(acceptanceRevisionId),
      sourceEventId: id(comparison?.sourceEventId),
      acceptedAt: now,
      judgmentAtAcceptance: judgment,
      conditionAtAcceptance: conditionAtAcceptance(page, now),
      comparison: acceptedComparison
    },
    touched: [{ type: 'wiki_page', id: pageId, title: clean(page.title, 240) }],
    nextAction: { type: 'open_judgment', id: pageId, title: 'Review the company case' },
    createdAt: now
  };
};

const resolveQuery = async query => (
  query && typeof query.then === 'function' ? query : Promise.resolve(query)
);

const loadDossierJudgmentReview = async ({ NoeisReceipt, userId, pageId } = {}) => {
  if (!NoeisReceipt?.findOne || !userId || !pageId) return null;
  let query = NoeisReceipt.findOne({
    userId,
    kind: 'company_dossier_judgment_review',
    'provenance.pageId': id(pageId)
  });
  query = query.sort?.({ createdAt: -1 }) || query;
  const receipt = await resolveQuery(query);
  return serializeStoredReceipt(receipt);
};

const listDossierJudgmentReviews = async ({ NoeisReceipt, userId, limit = 200 } = {}) => {
  if (!NoeisReceipt?.find || !userId) return [];
  let query = NoeisReceipt.find({
    userId,
    kind: 'company_dossier_judgment_review',
    status: 'awaiting_review'
  });
  query = query.sort?.({ createdAt: -1 }) || query;
  query = query.limit?.(Math.max(1, Math.min(Number(limit) || 200, 500))) || query;
  const rows = typeof query.lean === 'function' ? await query.lean() : await resolveQuery(query);
  return (Array.isArray(rows) ? rows : [])
    .map(serializeStoredReceipt)
    .filter(receipt => receipt?.id && id(receipt.provenance?.pageId));
};

const resolveDossierJudgmentReview = async ({
  NoeisReceipt,
  JudgmentResponseDraft = null,
  userId,
  page,
  receiptId,
  resolution,
  now = new Date()
} = {}) => {
  const pageId = id(page);
  const selected = clean(resolution, 24).toLowerCase();
  if (!['kept', 'revised'].includes(selected)) {
    throw new DossierJudgmentReviewError('Resolution must be kept or revised.', 400);
  }
  if (!NoeisReceipt?.findOne || !pageId || !userId) {
    throw new DossierJudgmentReviewError('The dossier review is unavailable.', 503);
  }
  const stored = await resolveQuery(NoeisReceipt.findOne({ userId, receiptId: clean(receiptId, 200) }));
  const receipt = serializeStoredReceipt(stored);
  if (!receipt || receipt.kind !== 'company_dossier_judgment_review') {
    throw new DossierJudgmentReviewError('The dossier review was not found.', 404);
  }
  if (id(receipt.provenance?.pageId) !== pageId) {
    throw new DossierJudgmentReviewError('The dossier review does not belong to this case.', 409);
  }
  const priorResolution = clean(receipt.provenance?.resolution, 24);
  if (receipt.status === 'completed') {
    if (priorResolution === selected) return receipt;
    throw new DossierJudgmentReviewError('This dossier review was already resolved differently.', 409);
  }
  if (receipt.status !== 'awaiting_review') {
    throw new DossierJudgmentReviewError('This dossier review is not awaiting a decision.', 409);
  }

  const before = clean(receipt.provenance?.judgmentAtAcceptance);
  const current = clean(page?.judgment?.currentJudgment);
  if (selected === 'revised' && (!current || current === before)) {
    throw new DossierJudgmentReviewError(
      'Revise the judgment sentence before marking this research review revised.',
      409,
      'DOSSIER_JUDGMENT_NOT_REVISED'
    );
  }
  const draft = JudgmentResponseDraft?.findOne
    ? await resolveQuery(JudgmentResponseDraft.findOne({
      userId,
      pageId,
      observationId: receipt.id,
      status: 'active'
    }))
    : null;
  const response = recordedResponse(draft);
  if (response && (
    (selected === 'kept' && response.response !== 'keep')
    || (selected === 'revised' && !['narrow', 'different'].includes(response.response))
  )) {
    throw new DossierJudgmentReviewError(
      'The saved response no longer matches this resolution. Reopen it before recording.',
      409,
      'DOSSIER_JUDGMENT_RESPONSE_MISMATCH'
    );
  }

  const completedReceipt = {
    ...receipt,
    status: 'completed',
    summary: selected === 'kept'
      ? 'Reviewed the accepted research and kept the current judgment.'
      : 'Reviewed the accepted research and revised the current judgment.',
    provenance: {
      ...receipt.provenance,
      resolution: selected,
      resolvedAt: now,
      judgmentAfterReview: current,
      ...(response ? { recordedResponse: { ...response, recordedAt: now } } : {})
    },
    completedAt: now,
    nextAction: { type: 'open_judgment', id: pageId, title: 'Open the company case' }
  };
  const safeReceipt = sanitizeReceiptForStorage(completedReceipt);
  const updated = await resolveQuery(NoeisReceipt.findOneAndUpdate({
    userId,
    receiptId: receipt.id,
    kind: 'company_dossier_judgment_review',
    status: 'awaiting_review',
    'provenance.pageId': pageId
  }, {
    $set: { ...safeReceipt, userId }
  }, { new: true }));
  if (updated) {
    if (draft && JudgmentResponseDraft?.findOneAndUpdate) {
      try {
        await resolveQuery(JudgmentResponseDraft.findOneAndUpdate({
          userId,
          pageId,
          observationId: receipt.id,
          version: response.draftVersion,
          status: 'active'
        }, {
          $set: { status: 'completed', completedAt: now }
        }));
      } catch (error) {
        console.error('Failed to retire completed judgment response draft.', error);
      }
    }
    return serializeStoredReceipt(updated);
  }

  const latest = serializeStoredReceipt(await resolveQuery(NoeisReceipt.findOne({
    userId,
    receiptId: receipt.id,
    kind: 'company_dossier_judgment_review',
    'provenance.pageId': pageId
  })));
  if (latest?.status === 'completed' && clean(latest.provenance?.resolution, 24) === selected) {
    return latest;
  }
  throw new DossierJudgmentReviewError('This dossier review was resolved by another request.', 409);
};

module.exports = {
  DossierJudgmentReviewError,
  buildDossierJudgmentReviewReceipt,
  conditionAtAcceptance,
  compactComparison,
  listDossierJudgmentReviews,
  loadDossierJudgmentReview,
  resolveDossierJudgmentReview
};
