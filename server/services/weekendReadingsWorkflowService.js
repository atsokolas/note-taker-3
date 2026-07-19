const {
  APPROVAL_CONFIRMATION,
  PUBLICATION_CONFIRMATION,
  RECEIPT_KINDS,
  REVIEW_CONFIRMATION,
  buildApprovalCandidate,
  buildApprovalReceipt,
  buildPublicationReceipt,
  buildReviewRequestReceipt,
  deriveApprovalState,
  persistLifecycleReceipt,
  serializePublishedArtifact
} = require('./weekendReadingsApprovalService');

const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const idOf = value => clean(value?._id || value?.id || value, 160);
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;

const resolveQuery = async query => {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
};

const resolveMany = async query => {
  if (!query) return [];
  if (Array.isArray(query)) {
    return [...query].sort((a, b) => new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0));
  }
  if (typeof query.sort === 'function') query = query.sort({ completedAt: -1, updatedAt: -1 });
  if (typeof query.lean === 'function') return query.lean();
  return query;
};

const findCurrentRevision = async ({ WikiRevision, userId, pageId } = {}) => {
  let query = WikiRevision.findOne({ userId, pageId });
  if (typeof query?.sort === 'function') query = query.sort({ createdAt: -1 });
  const revision = await resolveQuery(query);
  if (!revision || !revision.after || revision.snapshotPrunedAt) throw new Error('The current exact Wiki revision snapshot is unavailable.');
  return revision;
};

const findOwnedWeekendReadingsPage = async ({ WikiPage, userId, pageId } = {}) => {
  const page = await resolveQuery(WikiPage.findOne({ _id: pageId, userId, status: { $ne: 'archived' } }));
  if (!page || !clean(page?.createdFrom?.label, 240).startsWith('weekend-readings:')) throw new Error('Weekend Readings page not found.');
  return page;
};

const listLifecycleReceipts = async ({ NoeisReceipt, userId, pageId, editionKey = '' } = {}) => {
  const query = {
    userId,
    kind: { $in: Object.values(RECEIPT_KINDS) },
    'provenance.pageId': idOf(pageId)
  };
  if (editionKey) query['provenance.editionKey'] = clean(editionKey, 240);
  const rows = await resolveMany(NoeisReceipt.find(query));
  return (Array.isArray(rows) ? rows : []).map(plain);
};

const matchingReceipt = (receipts, kind, revisionId) => (Array.isArray(receipts) ? receipts : [])
  .filter(receipt => receipt.kind === kind && idOf(receipt?.provenance?.revisionId) === idOf(revisionId))
  .sort((a, b) => new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0))[0] || null;

const loadWorkflowContext = async ({ WikiPage, WikiRevision, NoeisReceipt, userId, pageId } = {}) => {
  if (!WikiPage || !WikiRevision || !NoeisReceipt || !userId || !pageId) throw new Error('Wiki models, userId, and pageId are required.');
  const page = await findOwnedWeekendReadingsPage({ WikiPage, userId, pageId });
  const revision = await findCurrentRevision({ WikiRevision, userId, pageId: idOf(page) });
  const candidate = buildApprovalCandidate({
    snapshot: plain(revision.after),
    revisionId: idOf(revision),
    editionKey: page.createdFrom.label
  });
  const receipts = await listLifecycleReceipts({ NoeisReceipt, userId, pageId: idOf(page), editionKey: candidate.editionKey });
  return { page, revision, candidate, receipts };
};

const requestWeekendReadingsReview = async ({ models = {}, userId, pageId, confirmation, now = new Date(), persistReceipt } = {}) => {
  const context = await loadWorkflowContext({ ...models, userId, pageId });
  const receipt = buildReviewRequestReceipt({
    candidate: context.candidate,
    pageId: idOf(context.page),
    actorUserId: userId,
    confirmation,
    at: now
  });
  const stored = await persistLifecycleReceipt({ NoeisReceipt: models.NoeisReceipt, userId, receipt, persistNoeisReceipt: persistReceipt });
  return { ...context, receipt: stored || receipt, state: deriveApprovalState({ currentRevisionId: idOf(context.revision), receipts: [...context.receipts, stored || receipt] }) };
};

const approveWeekendReadingsRevision = async ({ models = {}, userId, pageId, confirmation, now = new Date(), persistReceipt } = {}) => {
  const context = await loadWorkflowContext({ ...models, userId, pageId });
  const reviewReceipt = matchingReceipt(context.receipts, RECEIPT_KINDS.review, idOf(context.revision));
  const receipt = buildApprovalReceipt({
    candidate: context.candidate,
    reviewReceipt,
    pageId: idOf(context.page),
    actorUserId: userId,
    confirmation,
    at: now
  });
  const stored = await persistLifecycleReceipt({ NoeisReceipt: models.NoeisReceipt, userId, receipt, persistNoeisReceipt: persistReceipt });
  return { ...context, receipt: stored || receipt, state: deriveApprovalState({ currentRevisionId: idOf(context.revision), receipts: [...context.receipts, stored || receipt] }) };
};

const publishWeekendReadingsRevision = async ({ models = {}, userId, pageId, confirmation, now = new Date(), persistReceipt } = {}) => {
  const context = await loadWorkflowContext({ ...models, userId, pageId });
  const approvalReceipt = matchingReceipt(context.receipts, RECEIPT_KINDS.approval, idOf(context.revision));
  const receipt = buildPublicationReceipt({
    approvalReceipt,
    currentRevisionId: idOf(context.revision),
    pageId: idOf(context.page),
    actorUserId: userId,
    confirmation,
    at: now
  });
  const stored = await persistLifecycleReceipt({ NoeisReceipt: models.NoeisReceipt, userId, receipt, persistNoeisReceipt: persistReceipt });
  const publicArtifact = serializePublishedArtifact({
    approvalReceipt,
    publicationReceipt: stored || receipt,
    slug: context.page.slug,
    publishedAt: now
  });
  if (!publicArtifact) throw new Error('Approved Weekend Readings serialization failed closed.');
  return { ...context, approvalReceipt, receipt: stored || receipt, publicArtifact, state: deriveApprovalState({ currentRevisionId: idOf(context.revision), receipts: [...context.receipts, stored || receipt] }) };
};

const loadPublishedWeekendReadingsArtifact = async ({ NoeisReceipt, page, ownerUserId } = {}) => {
  if (!NoeisReceipt || !page || !ownerUserId || page.visibility !== 'shared' || page.status !== 'published') return null;
  const pageId = idOf(page);
  let publicationQuery = NoeisReceipt.findOne({
    userId: ownerUserId,
    kind: RECEIPT_KINDS.publication,
    status: 'published',
    'provenance.pageId': pageId
  });
  if (typeof publicationQuery?.sort === 'function') publicationQuery = publicationQuery.sort({ completedAt: -1, updatedAt: -1 });
  const publicationReceipt = plain(await resolveQuery(publicationQuery));
  if (!publicationReceipt) return null;
  const approvalReceiptId = clean(publicationReceipt?.provenance?.approvalReceiptId, 300);
  const approvalReceipt = plain(await resolveQuery(NoeisReceipt.findOne({
    userId: ownerUserId,
    receiptId: approvalReceiptId,
    kind: RECEIPT_KINDS.approval,
    status: 'approved',
    'provenance.pageId': pageId
  })));
  if (!approvalReceipt) return null;
  return serializePublishedArtifact({ approvalReceipt, publicationReceipt, slug: page.slug });
};

module.exports = {
  APPROVAL_CONFIRMATION,
  PUBLICATION_CONFIRMATION,
  REVIEW_CONFIRMATION,
  approveWeekendReadingsRevision,
  findCurrentRevision,
  findOwnedWeekendReadingsPage,
  listLifecycleReceipts,
  loadPublishedWeekendReadingsArtifact,
  loadWorkflowContext,
  matchingReceipt,
  publishWeekendReadingsRevision,
  requestWeekendReadingsReview
};
