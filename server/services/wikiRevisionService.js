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
    aiState: raw.aiState || {}
  };
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
  summary = ''
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
    summary
  });
  await revision.save();
  return revision;
};

module.exports = {
  createWikiRevision,
  snapshotPage
};
