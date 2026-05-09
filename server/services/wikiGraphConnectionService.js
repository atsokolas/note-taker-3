const WIKI_PAGE_ITEM_TYPE = 'wiki_page';
const WIKI_CLAIM_ITEM_TYPE = 'wiki_claim';
const SOURCE_CONNECTION_TYPES = new Set(['article', 'highlight', 'notebook', 'concept', 'question']);

const normalizeId = (value) => String(value || '').trim();

const normalizeConnectionRow = ({
  userId,
  fromType,
  fromId,
  toType,
  toId,
  relationType = 'related'
}) => ({
  userId,
  scopeType: '',
  scopeId: '',
  fromType: normalizeId(fromType),
  fromId: normalizeId(fromId),
  toType: normalizeId(toType),
  toId: normalizeId(toId),
  relationType
});

const buildWikiPageConnectionQuery = ({ userId, fromPageId, toPageId, relationType = 'related' }) => normalizeConnectionRow({
  userId,
  fromType: WIKI_PAGE_ITEM_TYPE,
  fromId: fromPageId,
  toType: WIKI_PAGE_ITEM_TYPE,
  toId: toPageId,
  relationType
});

const buildWikiClaimId = ({ pageId, claimId }) => {
  const safePageId = normalizeId(pageId);
  const safeClaimId = normalizeId(claimId);
  if (!safePageId || !safeClaimId) return '';
  return `${safePageId}:${safeClaimId}`;
};

const isUsableConnectionRow = (row) => (
  Boolean(row?.userId && row?.fromType && row?.fromId && row?.toType && row?.toId && row?.relationType)
  && !(row.fromType === row.toType && row.fromId === row.toId)
);

const persistConnectionRow = async ({ Connection, row }) => {
  if (!Connection || !isUsableConnectionRow(row)) return null;

  if (typeof Connection.findOneAndUpdate === 'function') {
    return Connection.findOneAndUpdate(
      row,
      { $setOnInsert: row },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  if (typeof Connection.findOne === 'function') {
    const existingQuery = Connection.findOne(row);
    const existing = typeof existingQuery?.lean === 'function'
      ? await existingQuery.lean()
      : await existingQuery;
    if (existing) return existing;
  }

  if (typeof Connection.create === 'function') {
    return Connection.create(row);
  }

  return null;
};

const persistWikiPageConnection = async ({
  Connection,
  userId,
  fromPageId,
  toPageId,
  relationType = 'related'
}) => {
  const query = buildWikiPageConnectionQuery({ userId, fromPageId, toPageId, relationType });
  return persistConnectionRow({ Connection, row: query });
};

const collectWikiLinkPageIds = (node, out = new Set()) => {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach(child => collectWikiLinkPageIds(child, out));
    return out;
  }
  if (typeof node !== 'object') return out;

  if (Array.isArray(node.marks)) {
    node.marks.forEach((mark) => {
      if (mark?.type !== 'wikiLink') return;
      const pageId = normalizeId(mark?.attrs?.pageId);
      if (pageId) out.add(pageId);
    });
  }
  if (Array.isArray(node.content)) collectWikiLinkPageIds(node.content, out);
  return out;
};

const buildWikiPageGraphRows = ({ page, userId }) => {
  const pageId = normalizeId(page?._id || page?.id);
  if (!pageId || !userId) return [];
  const seen = new Set();
  const rows = [];
  const addRow = (row) => {
    if (!isUsableConnectionRow(row)) return;
    const key = `${row.fromType}:${row.fromId}->${row.toType}:${row.toId}:${row.relationType}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  collectWikiLinkPageIds(page?.body).forEach((targetPageId) => {
    addRow(buildWikiPageConnectionQuery({
      userId,
      fromPageId: pageId,
      toPageId: targetPageId,
      relationType: 'related'
    }));
  });

  (Array.isArray(page?.sourceRefs) ? page.sourceRefs : []).forEach((sourceRef) => {
    const sourceType = normalizeId(sourceRef?.type);
    const sourceObjectId = normalizeId(sourceRef?.objectId);
    if (!SOURCE_CONNECTION_TYPES.has(sourceType) || !sourceObjectId) return;
    addRow(normalizeConnectionRow({
      userId,
      fromType: sourceType,
      fromId: sourceObjectId,
      toType: WIKI_PAGE_ITEM_TYPE,
      toId: pageId,
      relationType: 'supports'
    }));
  });

  const sourceByCitationId = new Map();
  (Array.isArray(page?.citations) ? page.citations : []).forEach((citation) => {
    const citationId = normalizeId(citation?._id || citation?.id);
    const sourceRefId = normalizeId(citation?.sourceRefId);
    const sourceType = normalizeId(citation?.sourceType);
    const sourceObjectId = normalizeId(citation?.sourceObjectId);
    if (citationId && SOURCE_CONNECTION_TYPES.has(sourceType) && sourceObjectId) {
      sourceByCitationId.set(citationId, { type: sourceType, objectId: sourceObjectId });
    }
    if (sourceRefId && SOURCE_CONNECTION_TYPES.has(sourceType) && sourceObjectId) {
      sourceByCitationId.set(sourceRefId, { type: sourceType, objectId: sourceObjectId });
    }
  });
  (Array.isArray(page?.sourceRefs) ? page.sourceRefs : []).forEach((sourceRef) => {
    const sourceRefId = normalizeId(sourceRef?._id || sourceRef?.id);
    const sourceType = normalizeId(sourceRef?.type);
    const sourceObjectId = normalizeId(sourceRef?.objectId);
    if (sourceRefId && SOURCE_CONNECTION_TYPES.has(sourceType) && sourceObjectId) {
      sourceByCitationId.set(sourceRefId, { type: sourceType, objectId: sourceObjectId });
    }
  });

  (Array.isArray(page?.claims) ? page.claims : []).forEach((claim) => {
    const claimGraphId = buildWikiClaimId({ pageId, claimId: claim?.claimId });
    if (!claimGraphId) return;
    addRow(normalizeConnectionRow({
      userId,
      fromType: WIKI_PAGE_ITEM_TYPE,
      fromId: pageId,
      toType: WIKI_CLAIM_ITEM_TYPE,
      toId: claimGraphId,
      relationType: 'contains'
    }));

    const support = normalizeId(claim?.support);
    (Array.isArray(claim?.citationIds) ? claim.citationIds : []).forEach((citationId) => {
      const source = sourceByCitationId.get(normalizeId(citationId));
      if (!source) return;
      addRow(normalizeConnectionRow({
        userId,
        fromType: source.type,
        fromId: source.objectId,
        toType: WIKI_CLAIM_ITEM_TYPE,
        toId: claimGraphId,
        relationType: support === 'conflicted' ? 'contradicts' : 'supports'
      }));
    });

    if (support === 'unsupported' || support === 'partial' || support === 'conflicted') {
      addRow(normalizeConnectionRow({
        userId,
        fromType: WIKI_CLAIM_ITEM_TYPE,
        fromId: claimGraphId,
        toType: WIKI_PAGE_ITEM_TYPE,
        toId: pageId,
        relationType: support === 'conflicted' ? 'contradicts' : 'needs_review'
      }));
    }
  });

  return rows;
};

const deleteSyncedWikiPageConnections = async ({ Connection, userId, pageId }) => {
  if (!Connection || typeof Connection.deleteMany !== 'function') return { deletedCount: 0 };
  const safePageId = normalizeId(pageId);
  if (!userId || !safePageId) return { deletedCount: 0 };
  return Connection.deleteMany({
    userId,
    scopeType: '',
    scopeId: '',
    $or: [
      {
        fromType: WIKI_PAGE_ITEM_TYPE,
        fromId: safePageId,
        relationType: 'related'
      },
      {
        toType: WIKI_PAGE_ITEM_TYPE,
        toId: safePageId,
        relationType: 'supports',
        fromType: { $in: Array.from(SOURCE_CONNECTION_TYPES) }
      },
      {
        fromType: WIKI_PAGE_ITEM_TYPE,
        fromId: safePageId,
        toType: WIKI_CLAIM_ITEM_TYPE,
        relationType: 'contains'
      },
      {
        toType: WIKI_CLAIM_ITEM_TYPE,
        toId: { $regex: `^${safePageId}:` },
        relationType: { $in: ['supports', 'contradicts'] }
      },
      {
        fromType: WIKI_CLAIM_ITEM_TYPE,
        fromId: { $regex: `^${safePageId}:` },
        toType: WIKI_PAGE_ITEM_TYPE,
        toId: safePageId,
        relationType: { $in: ['needs_review', 'contradicts'] }
      }
    ]
  });
};

const syncWikiPageGraphConnections = async ({ Connection, userId, page }) => {
  const pageId = normalizeId(page?._id || page?.id);
  if (!Connection || !userId || !pageId) {
    return { synced: false, deletedCount: 0, createdCount: 0, rows: [] };
  }

  const rows = buildWikiPageGraphRows({ page, userId });
  const deleted = await deleteSyncedWikiPageConnections({ Connection, userId, pageId });
  let createdCount = 0;
  for (const row of rows) {
    const saved = await persistConnectionRow({ Connection, row });
    if (saved) createdCount += 1;
  }
  return {
    synced: true,
    deletedCount: deleted?.deletedCount || 0,
    createdCount,
    rows
  };
};

const rebuildWikiGraphConnections = async ({ Connection, WikiPage, userId, limit = 500 }) => {
  if (!Connection || !WikiPage || !userId) {
    return { pagesProcessed: 0, edgesCreated: 0, edgesDeleted: 0 };
  }
  const query = WikiPage.find({ userId, status: { $ne: 'archived' } })
    .sort({ updatedAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit) || 500, 1000)));
  const pages = typeof query.lean === 'function' ? await query.lean() : await query;
  let edgesCreated = 0;
  let edgesDeleted = 0;
  for (const page of pages || []) {
    const result = await syncWikiPageGraphConnections({ Connection, userId, page });
    edgesCreated += result.createdCount || 0;
    edgesDeleted += result.deletedCount || 0;
  }
  return {
    pagesProcessed: Array.isArray(pages) ? pages.length : 0,
    edgesCreated,
    edgesDeleted
  };
};

module.exports = {
  WIKI_PAGE_ITEM_TYPE,
  WIKI_CLAIM_ITEM_TYPE,
  SOURCE_CONNECTION_TYPES,
  buildWikiClaimId,
  buildWikiPageConnectionQuery,
  buildWikiPageGraphRows,
  collectWikiLinkPageIds,
  deleteSyncedWikiPageConnections,
  persistWikiPageConnection,
  rebuildWikiGraphConnections,
  syncWikiPageGraphConnections
};
