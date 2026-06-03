const WIKI_PAGE_ITEM_TYPE = 'wiki_page';
const WIKI_CLAIM_ITEM_TYPE = 'wiki_claim';
const SOURCE_CONNECTION_TYPES = new Set(['article', 'highlight', 'notebook', 'concept', 'question']);
const INVERSE_RELATION_TYPES = {
  related: 'referenced_by',
  referenced_by: 'related',
  supports: 'supported_by',
  supported_by: 'supports',
  contradicts: 'contradicted_by',
  contradicted_by: 'contradicts',
  contains: 'contained_by',
  contained_by: 'contains',
  shared_source: 'shared_source',
  needs_review: 'review_needed_by',
  review_needed_by: 'needs_review'
};
const WIKI_SYNC_RELATION_TYPES = Object.keys(INVERSE_RELATION_TYPES);

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

const sourceKey = (source = {}) => `${normalizeId(source.type)}:${normalizeId(source.objectId)}`;

const wikiPageSourceKey = (source = {}) => {
  const sourceType = normalizeId(source.type).toLowerCase();
  const sourceObjectId = normalizeId(source.objectId);
  if (sourceType && sourceObjectId) return `${sourceType}:${sourceObjectId}`;
  const fallback = normalizeId(source.url || source._id || source.id || source.title).toLowerCase();
  return fallback ? `source:${fallback}` : '';
};

const inverseConnectionRow = (row) => {
  const inverseRelationType = INVERSE_RELATION_TYPES[row?.relationType];
  if (!inverseRelationType) return null;
  return normalizeConnectionRow({
    userId: row.userId,
    fromType: row.toType,
    fromId: row.toId,
    toType: row.fromType,
    toId: row.fromId,
    relationType: inverseRelationType
  });
};

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
    [row, inverseConnectionRow(row)].filter(Boolean).forEach((candidate) => {
      if (!isUsableConnectionRow(candidate)) return;
      const key = `${candidate.fromType}:${candidate.fromId}->${candidate.toType}:${candidate.toId}:${candidate.relationType}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(candidate);
    });
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

  const sourceByEvidenceId = new Map();
  (Array.isArray(page?.citations) ? page.citations : []).forEach((citation) => {
    const citationId = normalizeId(citation?._id || citation?.id);
    const sourceRefId = normalizeId(citation?.sourceRefId);
    const sourceType = normalizeId(citation?.sourceType);
    const sourceObjectId = normalizeId(citation?.sourceObjectId);
    if (citationId && SOURCE_CONNECTION_TYPES.has(sourceType) && sourceObjectId) {
      sourceByEvidenceId.set(citationId, { type: sourceType, objectId: sourceObjectId });
    }
    if (sourceRefId && SOURCE_CONNECTION_TYPES.has(sourceType) && sourceObjectId) {
      sourceByEvidenceId.set(sourceRefId, { type: sourceType, objectId: sourceObjectId });
    }
  });
  (Array.isArray(page?.sourceRefs) ? page.sourceRefs : []).forEach((sourceRef) => {
    const sourceRefId = normalizeId(sourceRef?._id || sourceRef?.id);
    const sourceType = normalizeId(sourceRef?.type);
    const sourceObjectId = normalizeId(sourceRef?.objectId);
    if (sourceRefId && SOURCE_CONNECTION_TYPES.has(sourceType) && sourceObjectId) {
      sourceByEvidenceId.set(sourceRefId, { type: sourceType, objectId: sourceObjectId });
    }
  });

  const addClaimEvidenceRows = ({ claimGraphId, evidenceIds = [], relationType = 'supports' }) => {
    (Array.isArray(evidenceIds) ? evidenceIds : []).forEach((evidenceId) => {
      const source = sourceByEvidenceId.get(normalizeId(evidenceId));
      if (!source) return;
      addRow(normalizeConnectionRow({
        userId,
        fromType: source.type,
        fromId: source.objectId,
        toType: WIKI_CLAIM_ITEM_TYPE,
        toId: claimGraphId,
        relationType
      }));
    });
  };

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
    const contradictedIds = Array.isArray(claim?.contradictedByCitationIds)
      ? claim.contradictedByCitationIds.map(normalizeId).filter(Boolean)
      : [];
    const contradictedIdSet = new Set(contradictedIds);
    const contradictedSourceKeys = new Set(
      contradictedIds
        .map(id => sourceByEvidenceId.get(id))
        .filter(Boolean)
        .map(sourceKey)
    );
    const supportingCitationIds = (Array.isArray(claim?.citationIds) ? claim.citationIds : [])
      .map(normalizeId)
      .filter(Boolean)
      .filter(id => !contradictedIdSet.has(id))
      .filter(id => !contradictedSourceKeys.has(sourceKey(sourceByEvidenceId.get(id))));
    const supportingSourceRefIds = (Array.isArray(claim?.sourceRefIds) ? claim.sourceRefIds : [])
      .map(normalizeId)
      .filter(Boolean)
      .filter(id => !contradictedIdSet.has(id))
      .filter(id => !contradictedSourceKeys.has(sourceKey(sourceByEvidenceId.get(id))));
    const conflictIds = contradictedIds.length
      ? contradictedIds
      : support === 'conflicted'
        ? [...supportingCitationIds, ...supportingSourceRefIds]
        : [];

    addClaimEvidenceRows({
      claimGraphId,
      evidenceIds: support === 'conflicted' && !contradictedIds.length ? [] : supportingCitationIds,
      relationType: 'supports'
    });
    addClaimEvidenceRows({
      claimGraphId,
      evidenceIds: support === 'conflicted' && !contradictedIds.length ? [] : supportingSourceRefIds,
      relationType: 'supports'
    });
    addClaimEvidenceRows({
      claimGraphId,
      evidenceIds: conflictIds,
      relationType: 'contradicts'
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

const buildSharedSourceWikiPageRows = ({ pages = [], userId } = {}) => {
  if (!userId || !Array.isArray(pages) || pages.length < 2) return [];
  const bySource = new Map();
  pages.forEach((page) => {
    const pageId = normalizeId(page?._id || page?.id);
    if (!pageId) return;
    (Array.isArray(page?.sourceRefs) ? page.sourceRefs : []).forEach((sourceRef) => {
      const key = wikiPageSourceKey(sourceRef);
      if (!key) return;
      if (!bySource.has(key)) bySource.set(key, new Set());
      bySource.get(key).add(pageId);
    });
  });

  const seenPairs = new Set();
  const rows = [];
  bySource.forEach((pageIds) => {
    const ids = Array.from(pageIds).sort();
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const fromPageId = ids[leftIndex];
        const toPageId = ids[rightIndex];
        const pairKey = `${fromPageId}:${toPageId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const row = buildWikiPageConnectionQuery({
          userId,
          fromPageId,
          toPageId,
          relationType: 'shared_source'
        });
        [row, inverseConnectionRow(row)].filter(Boolean).forEach(candidate => {
          if (isUsableConnectionRow(candidate)) rows.push(candidate);
        });
      }
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
        relationType: { $in: WIKI_SYNC_RELATION_TYPES }
      },
      {
        toType: WIKI_PAGE_ITEM_TYPE,
        toId: safePageId,
        relationType: { $in: WIKI_SYNC_RELATION_TYPES }
      },
      {
        fromType: WIKI_CLAIM_ITEM_TYPE,
        fromId: { $regex: `^${safePageId}:` },
        relationType: { $in: WIKI_SYNC_RELATION_TYPES }
      },
      {
        toType: WIKI_CLAIM_ITEM_TYPE,
        toId: { $regex: `^${safePageId}:` },
        relationType: { $in: WIKI_SYNC_RELATION_TYPES }
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
  const sharedSourceRows = buildSharedSourceWikiPageRows({ pages: pages || [], userId });
  for (const row of sharedSourceRows) {
    const saved = await persistConnectionRow({ Connection, row });
    if (saved) edgesCreated += 1;
  }
  return {
    pagesProcessed: Array.isArray(pages) ? pages.length : 0,
    edgesCreated,
    edgesDeleted,
    sharedSourceEdgesCreated: sharedSourceRows.length
  };
};

module.exports = {
  WIKI_PAGE_ITEM_TYPE,
  WIKI_CLAIM_ITEM_TYPE,
  SOURCE_CONNECTION_TYPES,
  INVERSE_RELATION_TYPES,
  WIKI_SYNC_RELATION_TYPES,
  buildWikiClaimId,
  buildWikiPageConnectionQuery,
  buildWikiPageGraphRows,
  buildSharedSourceWikiPageRows,
  collectWikiLinkPageIds,
  deleteSyncedWikiPageConnections,
  persistWikiPageConnection,
  rebuildWikiGraphConnections,
  syncWikiPageGraphConnections
};
