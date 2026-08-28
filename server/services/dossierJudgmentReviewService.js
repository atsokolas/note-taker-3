const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');

const clean = (value = '', limit = 600) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const id = value => clean(value?._id || value?.id || value, 100);

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

  return persistNoeisReceipt({
    NoeisReceipt,
    userId,
    receipt: {
      ...receipt,
      status: 'completed',
      summary: selected === 'kept'
        ? 'Reviewed the accepted research and kept the current judgment.'
        : 'Reviewed the accepted research and revised the current judgment.',
      provenance: {
        ...receipt.provenance,
        resolution: selected,
        resolvedAt: now,
        judgmentAfterReview: current
      },
      completedAt: now,
      nextAction: { type: 'open_judgment', id: pageId, title: 'Open the company case' }
    }
  });
};

module.exports = {
  DossierJudgmentReviewError,
  buildDossierJudgmentReviewReceipt,
  compactComparison,
  listDossierJudgmentReviews,
  loadDossierJudgmentReview,
  resolveDossierJudgmentReview
};
