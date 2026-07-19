const crypto = require('crypto');
const { buildWeekendReadingsBody, normalizeWeekendReadingItems } = require('./weekendReadingsService');
const { persistNoeisReceipt: defaultPersistNoeisReceipt } = require('./noeisReceiptService');

const REVIEW_CONFIRMATION = 'request_weekend_readings_review';
const APPROVAL_CONFIRMATION = 'approve_weekend_readings_revision';
const PUBLICATION_CONFIRMATION = 'publish_approved_weekend_readings_revision';

const RECEIPT_KINDS = Object.freeze({
  review: 'weekend_readings_review_requested',
  approval: 'weekend_readings_revision_approved',
  publication: 'weekend_readings_revision_published'
});

const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const idOf = value => clean(value?._id || value?.id || value, 160);
const clonePlain = value => JSON.parse(JSON.stringify(value ?? null));

const isoDate = (value = new Date(), field = 'date') => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date.toISOString();
};

const editionKeyFromSnapshot = (snapshot = {}) => clean(snapshot?.createdFrom?.label, 240);

const editionWindow = (editionKey = '') => {
  const parts = clean(editionKey, 240).split(':');
  if (parts[0] !== 'weekend-readings' || parts.length < 3) throw new Error('Weekend Readings edition key is invalid.');
  return { windowStart: parts[parts.length - 2], windowEnd: parts[parts.length - 1] };
};

const assertEditionSnapshot = (snapshot = {}, editionKey = '') => {
  const snapshotKey = editionKeyFromSnapshot(snapshot);
  const expectedKey = clean(editionKey, 240) || snapshotKey;
  if (!snapshotKey.startsWith('weekend-readings:') || snapshotKey !== expectedKey) {
    throw new Error('The revision is not the requested Weekend Readings edition.');
  }
  return expectedKey;
};

const nodeText = (node = {}) => {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return clean(node.text, 8000);
  return (Array.isArray(node.content) ? node.content : []).map(nodeText).filter(Boolean).join(' ');
};

const extractEditorialNote = (body = {}) => {
  const nodes = Array.isArray(body?.content) ? body.content : [];
  const start = nodes.findIndex(node => node.type === 'heading' && /^editorial note$/i.test(nodeText(node)));
  if (start < 0) return '';
  const paragraphs = [];
  for (let index = start + 1; index < nodes.length; index += 1) {
    if (nodes[index]?.type === 'heading' && Number(nodes[index]?.attrs?.level || 0) <= 2) break;
    const text = nodeText(nodes[index]);
    if (text) paragraphs.push(text);
  }
  return clean(paragraphs.join('\n'), 2000);
};

const extractAuthorLabel = (body = {}) => {
  const firstText = nodeText(Array.isArray(body?.content) ? body.content[0] : null);
  const match = firstText.match(/^(.*?)\s+—\s+researched and maintained with Noeis$/i);
  return clean(match?.[1], 160) || 'Athan Tsokolas';
};

const publicItemFromSource = (source = {}) => {
  const metadata = source?.metadata?.weekendReadings || {};
  const publishedAt = metadata.publishedAt || null;
  return {
    title: clean(source.title, 240),
    url: clean(metadata.canonicalUrl || source.url, 2000),
    whyItMatters: clean(metadata.whyItMatters || source.snippet, 1200),
    readingRole: clean(metadata.readingRole, 80),
    sourceQuality: clean(metadata.sourceQuality || 'unknown', 80),
    sourceLabel: clean(source.citationLabel || source.provider, 160),
    sourceDateLabel: clean(metadata.sourceDateLabel, 80)
      || (publishedAt ? isoDate(publishedAt, 'publishedAt').slice(0, 10) : 'Not recorded'),
    publicRelationship: clean(metadata.publicRelationship, 500) || 'Unassigned',
    boundary: clean(metadata.boundary, 800)
  };
};

const stableDigest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const artifactDigest = (artifact = {}) => {
  const { digest: _digest, ...unsigned } = artifact || {};
  return stableDigest(unsigned);
};

const assertCandidateIntegrity = (candidate = {}) => {
  if (!candidate.editionKey || !candidate.revisionId || !candidate.digest) throw new Error('A revision-bound approval candidate is required.');
  if (artifactDigest(candidate) !== candidate.digest) throw new Error('The approval candidate digest is inconsistent.');
};

const assertActorAndPage = ({ pageId, actorUserId } = {}) => {
  if (!idOf(pageId) || !idOf(actorUserId)) throw new Error('An authenticated human actor and Wiki page are required.');
};

const buildApprovalCandidate = ({ snapshot, revisionId, editionKey = '' } = {}) => {
  const resolvedRevisionId = idOf(revisionId);
  if (!snapshot || !resolvedRevisionId) throw new Error('An exact Wiki revision snapshot is required.');
  const resolvedEditionKey = assertEditionSnapshot(snapshot, editionKey);
  const editorialNote = extractEditorialNote(snapshot.body);
  if (!editorialNote) throw new Error('The approved revision must contain an editorial note.');
  const items = normalizeWeekendReadingItems((Array.isArray(snapshot.sourceRefs) ? snapshot.sourceRefs : []).map(publicItemFromSource));
  const title = clean(snapshot.title, 240);
  const authorLabel = extractAuthorLabel(snapshot.body);
  const window = editionWindow(resolvedEditionKey);
  const body = buildWeekendReadingsBody({
    title,
    authorLabel,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    editorialNote,
    items
  });
  const publicBody = {
    ...body,
    content: Array.isArray(body.content) ? body.content.slice(1) : []
  };
  const publicArtifact = {
    artifactType: 'weekend_readings',
    editionKey: resolvedEditionKey,
    revisionId: resolvedRevisionId,
    title,
    authorLabel,
    body: publicBody,
    plainText: publicBody.content.flatMap(node => node.content || []).map(node => node.text || '').filter(Boolean).join('\n'),
    sourceRefs: items.map(item => ({
      type: 'external',
      title: item.title,
      url: item.canonicalUrl,
      snippet: item.whyItMatters,
      sourceLabel: item.sourceLabel,
      sourceDateLabel: item.sourceDateLabel,
      readingRole: item.readingRole,
      sourceQuality: item.sourceQuality,
      publicRelationship: item.publicRelationship,
      boundary: item.boundary
    }))
  };
  return { ...publicArtifact, digest: artifactDigest(publicArtifact) };
};

const receiptBase = ({ id, kind, status, title, summary, editionKey, pageId, revisionId, at, actorUserId }) => ({
  id,
  kind,
  source: 'noeis',
  sourceLabel: 'Weekend Readings',
  status,
  title,
  summary,
  touched: [{ type: 'wiki_page', id: idOf(pageId), title }].filter(entry => entry.id),
  provenance: {
    editionKey: clean(editionKey, 240),
    pageId: idOf(pageId),
    revisionId: idOf(revisionId),
    actorUserId: idOf(actorUserId)
  },
  completedAt: isoDate(at)
});

const buildReviewRequestReceipt = ({ candidate, pageId, actorUserId, confirmation, at = new Date() } = {}) => {
  if (confirmation !== REVIEW_CONFIRMATION) throw new Error(`Review request requires confirmation "${REVIEW_CONFIRMATION}".`);
  assertCandidateIntegrity(candidate);
  assertActorAndPage({ pageId, actorUserId });
  return receiptBase({
    id: `${candidate.editionKey}:review:${candidate.revisionId}`,
    kind: RECEIPT_KINDS.review,
    status: 'review_requested',
    title: candidate.title,
    summary: 'Review requested for this exact private revision.',
    editionKey: candidate.editionKey,
    pageId,
    revisionId: candidate.revisionId,
    actorUserId,
    at
  });
};

const buildApprovalReceipt = ({ candidate, reviewReceipt, pageId, actorUserId, confirmation, at = new Date() } = {}) => {
  if (confirmation !== APPROVAL_CONFIRMATION) throw new Error(`Approval requires confirmation "${APPROVAL_CONFIRMATION}".`);
  assertCandidateIntegrity(candidate);
  assertActorAndPage({ pageId, actorUserId });
  if (reviewReceipt?.kind !== RECEIPT_KINDS.review || idOf(reviewReceipt?.provenance?.revisionId) !== idOf(candidate?.revisionId)) {
    throw new Error('Approval requires a review request for the same exact revision.');
  }
  if (idOf(reviewReceipt?.provenance?.pageId) !== idOf(pageId) || clean(reviewReceipt?.provenance?.editionKey, 240) !== candidate.editionKey) {
    throw new Error('Approval cannot cross Weekend Readings pages or editions.');
  }
  const receipt = receiptBase({
    id: `${candidate.editionKey}:approval:${candidate.revisionId}`,
    kind: RECEIPT_KINDS.approval,
    status: 'approved',
    title: candidate.title,
    summary: 'This exact revision is approved but not published.',
    editionKey: candidate.editionKey,
    pageId,
    revisionId: candidate.revisionId,
    actorUserId,
    at
  });
  receipt.provenance.reviewReceiptId = clean(reviewReceipt.id || reviewReceipt.receiptId, 300);
  receipt.provenance.publicArtifact = clonePlain(candidate);
  receipt.provenance.digest = candidate.digest;
  receipt.nextAction = { type: 'publication_approval_required', label: 'Athan explicitly publishes this approved revision.', targetId: idOf(pageId) };
  return receipt;
};

const buildPublicationReceipt = ({ approvalReceipt, currentRevisionId, pageId, actorUserId, confirmation, at = new Date() } = {}) => {
  if (confirmation !== PUBLICATION_CONFIRMATION) throw new Error(`Publication requires confirmation "${PUBLICATION_CONFIRMATION}".`);
  assertActorAndPage({ pageId, actorUserId });
  if (approvalReceipt?.kind !== RECEIPT_KINDS.approval || approvalReceipt?.status !== 'approved') {
    throw new Error('Publication requires an approved revision receipt.');
  }
  const approvedRevisionId = idOf(approvalReceipt?.provenance?.revisionId);
  if (idOf(approvalReceipt?.provenance?.pageId) !== idOf(pageId)) throw new Error('Publication cannot cross Weekend Readings pages.');
  if (!approvedRevisionId || approvedRevisionId !== idOf(currentRevisionId)) {
    throw new Error('Draft changed after approval; reapproval is required before publication.');
  }
  const artifact = approvalReceipt?.provenance?.publicArtifact;
  if (!artifact || artifact.digest !== approvalReceipt?.provenance?.digest || artifactDigest(artifact) !== artifact.digest) {
    throw new Error('The approved public artifact snapshot is missing or inconsistent.');
  }
  const receipt = receiptBase({
    id: `${artifact.editionKey}:publication:${approvedRevisionId}`,
    kind: RECEIPT_KINDS.publication,
    status: 'published',
    title: artifact.title,
    summary: `Published approved revision ${approvedRevisionId.slice(0, 8)}.`,
    editionKey: artifact.editionKey,
    pageId,
    revisionId: approvedRevisionId,
    actorUserId,
    at
  });
  receipt.provenance.approvalReceiptId = clean(approvalReceipt.id || approvalReceipt.receiptId, 300);
  receipt.provenance.digest = artifact.digest;
  receipt.nextAction = { type: 'inspect_public_artifact', label: 'Inspect the canonical public artifact.', targetId: idOf(pageId) };
  return receipt;
};

const deriveApprovalState = ({ currentRevisionId, receipts = [] } = {}) => {
  const current = idOf(currentRevisionId);
  const rows = (Array.isArray(receipts) ? receipts : []).map(row => row?.toObject ? row.toObject() : row).filter(Boolean);
  const receiptTime = row => new Date(row?.completedAt || row?.updatedAt || 0).getTime();
  const latest = (kind, revisionId = '') => rows
    .filter(row => row.kind === kind && (!revisionId || idOf(row.provenance?.revisionId) === revisionId))
    .sort((a, b) => receiptTime(b) - receiptTime(a))[0] || null;
  const publication = latest(RECEIPT_KINDS.publication);
  const approval = latest(RECEIPT_KINDS.approval);
  const review = latest(RECEIPT_KINDS.review);
  if (publication) {
    const revisionId = idOf(publication.provenance?.revisionId);
    if (current && current !== revisionId) {
      const currentApproval = latest(RECEIPT_KINDS.approval, current);
      const currentReview = latest(RECEIPT_KINDS.review, current);
      if (currentApproval && receiptTime(currentApproval) > receiptTime(publication)) {
        return {
          code: 'approved',
          label: 'Approved revision — not published',
          revisionId: current,
          publishedRevisionId: revisionId
        };
      }
      if (currentReview && receiptTime(currentReview) > receiptTime(publication)) {
        return {
          code: 'review_requested',
          label: 'Review requested — still private',
          revisionId: current,
          publishedRevisionId: revisionId
        };
      }
    }
    return { code: 'published', label: `Published — revision ${revisionId.slice(0, 8)}`, revisionId, draftChangedAfterPublication: Boolean(current && current !== revisionId) };
  }
  if (approval) {
    const revisionId = idOf(approval.provenance?.revisionId);
    if (current && current !== revisionId) return { code: 'stale_approval', label: 'Draft changed after approval — reapproval required', revisionId };
    return { code: 'approved', label: 'Approved revision — not published', revisionId };
  }
  if (review) {
    const revisionId = idOf(review.provenance?.revisionId);
    if (!current || current === revisionId) return { code: 'review_requested', label: 'Review requested — still private', revisionId };
  }
  return { code: 'private_draft', label: 'Private draft — not public', revisionId: current };
};

const serializePublishedArtifact = ({ approvalReceipt, publicationReceipt, slug = '', publishedAt = null } = {}) => {
  if (publicationReceipt?.kind !== RECEIPT_KINDS.publication || publicationReceipt?.status !== 'published') return null;
  if (approvalReceipt?.kind !== RECEIPT_KINDS.approval || approvalReceipt?.status !== 'approved') return null;
  const artifact = approvalReceipt?.provenance?.publicArtifact;
  const digest = clean(approvalReceipt?.provenance?.digest, 128);
  if (!artifact || artifact.digest !== digest || artifactDigest(artifact) !== digest || clean(publicationReceipt?.provenance?.digest, 128) !== digest) return null;
  if (idOf(publicationReceipt?.provenance?.revisionId) !== idOf(artifact.revisionId)) return null;
  return {
    artifactType: 'weekend_readings',
    title: artifact.title,
    slug: clean(slug, 160),
    authorLabel: artifact.authorLabel,
    status: 'published',
    visibility: 'shared',
    body: clonePlain(artifact.body),
    plainText: artifact.plainText,
    sourceRefs: clonePlain(artifact.sourceRefs),
    publication: {
      approvedRevisionId: idOf(artifact.revisionId),
      digest,
      publishedAt: publishedAt || publicationReceipt.completedAt || null
    }
  };
};

const persistLifecycleReceipt = async ({ NoeisReceipt, userId, receipt, persistNoeisReceipt = defaultPersistNoeisReceipt } = {}) => (
  persistNoeisReceipt({ NoeisReceipt, userId, receipt })
);

module.exports = {
  APPROVAL_CONFIRMATION,
  PUBLICATION_CONFIRMATION,
  RECEIPT_KINDS,
  REVIEW_CONFIRMATION,
  assertCandidateIntegrity,
  artifactDigest,
  buildApprovalCandidate,
  buildApprovalReceipt,
  buildPublicationReceipt,
  buildReviewRequestReceipt,
  deriveApprovalState,
  editionWindow,
  persistLifecycleReceipt,
  serializePublishedArtifact,
  stableDigest
};
