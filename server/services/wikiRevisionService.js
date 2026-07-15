const clonePlain = (value) => JSON.parse(JSON.stringify(value ?? null));

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
    freshness: raw.freshness || {},
    publicProof: raw.publicProof || {},
    aiState: raw.aiState || {}
  };
};

const restorePageSnapshot = (page, snapshot = {}) => {
  if (!page || !snapshot) return page;
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
    'freshness',
    'publicProof',
    'aiState'
  ].forEach((field) => {
    if (snapshot[field] === undefined) return;
    page[field] = clonePlain(snapshot[field]);
    if (typeof page.markModified === 'function') page.markModified(field);
  });
  return page;
};

const createWikiRevision = async ({
  WikiRevision,
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
  summary = '',
  pruneRevisionHistory
} = {}) => {
  if (!WikiRevision || !userId || (!page && !pageId)) return null;
  const resolvedPageId = pageId || page?._id;
  const revision = new WikiRevision({
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
    summary
  });
  await revision.save();
  try {
    if (pruneRevisionHistory || typeof WikiRevision.countDocuments === 'function') {
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
  snapshotPage
};
