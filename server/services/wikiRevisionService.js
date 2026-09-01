const crypto = require('crypto');

const clonePlain = (value) => JSON.parse(JSON.stringify(value ?? null));

const canonicalize = (value) => {
  const plain = clonePlain(value);
  if (Array.isArray(plain)) return plain.map(canonicalize);
  if (!plain || typeof plain !== 'object') return plain;
  return Object.keys(plain).sort().reduce((result, key) => {
    result[key] = canonicalize(plain[key]);
    return result;
  }, {});
};

const contentProjection = (snapshot = {}) => ({
  title: snapshot?.title || '',
  body: snapshot?.body || null,
  plainText: snapshot?.plainText || '',
  sourceRefs: snapshot?.sourceRefs || [],
  claims: snapshot?.claims || [],
  citations: snapshot?.citations || [],
  judgment: snapshot?.judgment || null,
  investmentDossier: snapshot?.investmentDossier || null
});

const snapshotContentHash = (snapshot = {}) => crypto
  .createHash('sha256')
  .update(JSON.stringify(contentProjection(snapshot)))
  .digest('hex');

const snapshotCanonicalContentHash = (snapshot = {}) => crypto
  .createHash('sha256')
  .update(JSON.stringify(canonicalize(contentProjection(snapshot))))
  .digest('hex');

const matchesTrustedRevisionHead = ({ current, revision } = {}) => {
  const recordedHash = String(revision?.sourceVersion?.trustedHeadHash || '');
  if (!recordedHash || !revision?.before) return false;
  const recordedSnapshotHashes = new Set([
    snapshotContentHash(revision.before),
    snapshotCanonicalContentHash(revision.before)
  ]);
  return recordedSnapshotHashes.has(recordedHash)
    && snapshotCanonicalContentHash(current) === snapshotCanonicalContentHash(revision.before);
};

const snapshotPage = (page) => {
  if (!page) return null;
  const raw = typeof page.toObject === 'function' ? page.toObject({ virtuals: false }) : { ...page };
  return {
    _id: raw._id,
    title: raw.title,
    slug: raw.slug,
    pageType: raw.pageType,
    status: raw.status,
    visibility: raw.visibility,
    sourceScope: raw.sourceScope,
    adoptedFrom: raw.adoptedFrom || {},
    body: raw.body || null,
    plainText: raw.plainText || '',
    sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [],
    claims: Array.isArray(raw.claims) ? raw.claims : [],
    citations: Array.isArray(raw.citations) ? raw.citations : [],
    judgment: raw.judgment || null,
    investmentDossier: raw.investmentDossier || null,
    freshness: raw.freshness || {},
    publicProof: raw.publicProof || {},
    aiState: raw.aiState || {}
  };
};

const restorePageSnapshot = (page, snapshot = {}) => {
  if (!page || !snapshot) return page;
  const initialRevisionId = page.judgment?.initialRevisionId || null;
  [
    'title',
    'slug',
    'pageType',
    'status',
    'visibility',
    'sourceScope',
    'adoptedFrom',
    'body',
    'plainText',
    'sourceRefs',
    'claims',
    'citations',
    'judgment',
    'investmentDossier',
    'freshness',
    'publicProof',
    'aiState'
  ].forEach((field) => {
    if (snapshot[field] === undefined) return;
    page[field] = clonePlain(snapshot[field]);
    if (typeof page.markModified === 'function') page.markModified(field);
  });
  if (initialRevisionId && page.judgment) {
    page.judgment.initialRevisionId = initialRevisionId;
    if (typeof page.markModified === 'function') page.markModified('judgment');
  }
  return page;
};

const createWikiRevision = async ({
  WikiRevision,
  revisionId = null,
  userId,
  page,
  pageId,
  before = null,
  after = null,
  reason = 'user_edit',
  actorType = 'user',
  sourceEventId = null,
  maintenanceRunId = null,
  promotionStatus = 'promoted',
  sourceVersion = null,
  quality = null,
  claimReview = null,
  summary = '',
  pruneRevisionHistory,
  session = null
} = {}) => {
  if (!WikiRevision || !userId || (!page && !pageId)) return null;
  const resolvedPageId = pageId || page?._id;
  const revision = new WikiRevision({
    ...(revisionId ? { _id: revisionId } : {}),
    userId,
    pageId: resolvedPageId,
    before,
    after: after || snapshotPage(page),
    reason,
    actorType,
    sourceEventId,
    maintenanceRunId,
    promotionStatus,
    sourceVersion,
    quality,
    claimReview,
    summary
  });
  await revision.save(session ? { session } : undefined);
  try {
    if (!session && (pruneRevisionHistory || typeof WikiRevision.countDocuments === 'function')) {
      const prune = pruneRevisionHistory
        || require('./wikiRevisionRetentionService').pruneWikiRevisionHistory;
      await prune({ WikiRevision, userId, pageId: resolvedPageId, page });
    }
  } catch (error) {
    console.warn('[wiki-revision-retention] Prune failed; revision was preserved.', error?.message || error);
  }
  return revision;
};

module.exports = {
  createWikiRevision,
  restorePageSnapshot,
  matchesTrustedRevisionHead,
  snapshotCanonicalContentHash,
  snapshotContentHash,
  snapshotPage
};
