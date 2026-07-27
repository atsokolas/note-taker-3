const { buildKnowledgeMovements } = require('./knowledgeMovementService');
const { isWikiPageSurfaceEligible } = require('./wikiPageQualityGuard');

const MIXED_SOURCE_SCAN_LIMIT = 1000;
const SOURCE_TYPES = Object.freeze(['article', 'highlight', 'note']);
const VIEW_NAMES = Object.freeze(['recent', 'active', 'needs_review', 'unconnected']);
const TYPE_RANK = Object.freeze({ article: 0, highlight: 1, note: 2 });

const clean = (value = '', limit = 240) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1)).trim()}…` : text;
};
const id = value => String(value?._id || value || '');
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const isoOrNull = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const safeSourceUrl = value => {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch (_error) {
    return undefined;
  }
};
const visible = value => value
  && value.hiddenFromHome !== true
  && value.debugOnly !== true
  && value.archived !== true;
const ownedBy = (value, userId) => id(value?.userId) === id(userId);
const normalizeType = value => {
  const type = clean(value, 40).toLowerCase();
  if (type === 'notebook') return 'note';
  if (type === 'wiki') return 'wiki_page';
  return type;
};
const persistedTypesFor = type => (
  normalizeType(type) === 'note' ? ['note', 'notebook'] : [normalizeType(type)]
);
const looseRefKey = (type, value) => `${normalizeType(type)}:${id(value)}`;
const refKey = (type, value, parentId = '') => (
  `${looseRefKey(type, value)}:${id(parentId)}`
);
const uniqueRefs = refs => {
  const seen = new Set();
  return (Array.isArray(refs) ? refs : []).filter(ref => {
    const key = `${ref?.type || ''}:${ref?.id || ''}:${ref?.parentId || ''}`;
    if (!ref?.type || !ref?.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const awaitQuery = async (query, { select, sort, limit } = {}) => {
  let next = query;
  if (select && next?.select) next = next.select(select);
  if (sort && next?.sort) next = next.sort(sort);
  if (limit && next?.limit) next = next.limit(limit);
  if (next?.lean) next = next.lean();
  return await next;
};

const conceptRef = concept => ({
  type: 'concept',
  id: id(concept),
  title: clean(concept?.name || 'Untitled concept'),
  href: `/think?tab=concepts&concept=${encodeURIComponent(concept?.name || id(concept))}`
});
const wikiPageRef = page => ({
  type: 'wiki_page',
  id: id(page),
  title: clean(page?.title || 'Untitled wiki page'),
  href: `/wiki/workspace?page=${encodeURIComponent(id(page))}`
});
const wikiClaimRef = (page, claim) => ({
  type: 'wiki_claim',
  id: clean(claim?.claimId, 160),
  parentId: id(page),
  title: clean(claim?.text || 'Untitled claim'),
  href: `/wiki/workspace?page=${encodeURIComponent(id(page))}&claimId=${encodeURIComponent(claim?.claimId || '')}`
});

const provenanceFor = ({ ownImportMeta = {}, parentImportMeta = {}, fallbackProvider = 'saved_source', extra = {} }) => ({
  provider: clean(ownImportMeta?.provider || parentImportMeta?.provider || fallbackProvider, 100),
  sourceType: clean(ownImportMeta?.sourceType || parentImportMeta?.sourceType, 100) || null,
  sourceLabel: clean(ownImportMeta?.sourceLabel || parentImportMeta?.sourceLabel, 160) || null,
  importedAt: isoOrNull(ownImportMeta?.importedAt || parentImportMeta?.importedAt),
  ...extra
});

const articleRow = article => ({
  source: {
    type: 'article',
    id: id(article),
    title: clean(article?.title || 'Untitled source'),
    href: `/library?articleId=${encodeURIComponent(id(article))}`,
    sourceUrl: safeSourceUrl(article?.url)
  },
  createdAt: isoOrNull(article?.importMeta?.importedAt || article?.createdAt),
  provenance: provenanceFor({
    ownImportMeta: article?.importMeta,
    fallbackProvider: article?.siteName || 'saved_source',
    extra: {
      siteName: clean(article?.siteName, 160) || null,
      author: clean(article?.author, 160) || null,
      publicationDate: clean(article?.publicationDate, 80) || null
    }
  })
});

const highlightRow = (article, highlight) => ({
  source: {
    type: 'highlight',
    id: id(highlight),
    parentId: id(article),
    title: clean(highlight?.text || highlight?.note || `Highlight from ${article?.title || 'source'}`),
    href: `/library?articleId=${encodeURIComponent(id(article))}&highlightId=${encodeURIComponent(id(highlight))}`,
    sourceUrl: safeSourceUrl(article?.url)
  },
  createdAt: isoOrNull(
    highlight?.importMeta?.importedAt
      || highlight?.createdAt
      || article?.importMeta?.importedAt
      || article?.createdAt
  ),
  provenance: provenanceFor({
    ownImportMeta: highlight?.importMeta,
    parentImportMeta: article?.importMeta,
    fallbackProvider: article?.siteName || 'saved_source',
    extra: {
      parentTitle: clean(article?.title, 180) || null,
      siteName: clean(article?.siteName, 160) || null,
      author: clean(article?.author, 160) || null,
      publicationDate: clean(article?.publicationDate, 80) || null
    }
  })
});

const noteRow = note => ({
  source: {
    type: 'note',
    id: id(note),
    title: clean(note?.title || note?.content || 'Untitled note'),
    href: `/think?tab=notebook&entryId=${encodeURIComponent(id(note))}`
  },
  createdAt: isoOrNull(note?.importMeta?.importedAt || note?.createdAt),
  provenance: provenanceFor({
    ownImportMeta: note?.importMeta,
    fallbackProvider: 'notebook',
    extra: {
      noteType: clean(note?.type, 80) || null,
      updatedAt: isoOrNull(note?.updatedAt)
    }
  })
});

const compareTuples = (left, right) => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === right[index]) continue;
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
};
const rowTuple = row => {
  const time = new Date(row?.createdAt || 0).getTime() || 0;
  return [
    -time,
    TYPE_RANK[row?.source?.type] ?? 99,
    String(row?.source?.id || ''),
    String(row?.source?.parentId || '')
  ];
};
const encodeCursor = ({ view, tuple }) => Buffer.from(JSON.stringify({
  version: 2,
  view,
  tuple
})).toString('base64url');
const decodeCursor = (value, expectedView) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (
      parsed?.version !== 2
      || parsed?.view !== expectedView
      || !Array.isArray(parsed?.tuple)
      || parsed.tuple.length !== 4
      || !Number.isFinite(parsed.tuple[0])
      || !Number.isInteger(parsed.tuple[1])
      || typeof parsed.tuple[2] !== 'string'
      || typeof parsed.tuple[3] !== 'string'
    ) throw new Error('invalid');
    return parsed;
  } catch (_error) {
    const error = new Error('cursor is invalid for this Library view.');
    error.status = 400;
    throw error;
  }
};

const classify = (row, view) => {
  if (view === 'active') {
    return row.relevance.connectedCount > 0 || row.relevance.movementCount > 0;
  }
  if (view === 'needs_review') {
    return row.relevance.movements.some(movement => movement.requiresReview);
  }
  if (view === 'unconnected') {
    return row.relevance.connectedCount === 0 && row.relevance.movementCount === 0;
  }
  return true;
};

const buildMixedLibraryRelevancePage = async ({
  userId,
  models = {},
  view = 'recent',
  limit = 40,
  cursor = '',
  includeSuppressed = false,
  movementBuilder = buildKnowledgeMovements
} = {}) => {
  if (!VIEW_NAMES.includes(view)) throw new Error(`Unsupported Library relevance view: ${view}`);
  const decodedCursor = decodeCursor(cursor, view);
  const {
    Article,
    NotebookEntry,
    TagMeta,
    WikiPage,
    Connection,
    ReferenceEdge
  } = models;
  if (!Article?.find || !NotebookEntry?.find) {
    return {
      sources: [],
      counts: Object.fromEntries(VIEW_NAMES.map(name => [name, { value: 0, exact: false }])),
      nextCursor: null,
      hasMore: false,
      coverage: {
        status: 'partial',
        sourceTypes: SOURCE_TYPES,
        scanned: { articles: 0, highlights: 0, notes: 0 },
        eligible: { articles: null, highlights: null, notes: null },
        limitations: ['mixed_source_models_unavailable']
      }
    };
  }

  const visibleQuery = includeSuppressed ? { userId } : {
    userId,
    hiddenFromHome: { $ne: true },
    debugOnly: { $ne: true },
    archived: { $ne: true }
  };
  const [articleRows, noteRows, articleTotal, noteTotal] = await Promise.all([
    awaitQuery(Article.find(visibleQuery), {
      select: '_id userId title url author publicationDate siteName importMeta highlights hiddenFromHome debugOnly archived createdAt updatedAt',
      sort: { createdAt: -1, _id: -1 },
      limit: MIXED_SOURCE_SCAN_LIMIT
    }),
    awaitQuery(NotebookEntry.find(visibleQuery), {
      select: '_id userId title content type importMeta hiddenFromHome debugOnly archived createdAt updatedAt',
      sort: { createdAt: -1, _id: -1 },
      limit: MIXED_SOURCE_SCAN_LIMIT
    }),
    Article.countDocuments ? Article.countDocuments(visibleQuery) : null,
    NotebookEntry.countDocuments ? NotebookEntry.countDocuments(visibleQuery) : null
  ]);

  const articles = (Array.isArray(articleRows) ? articleRows : [])
    .map(plain)
    .filter(value => ownedBy(value, userId) && (includeSuppressed || visible(value)));
  const notes = (Array.isArray(noteRows) ? noteRows : [])
    .map(plain)
    .filter(value => ownedBy(value, userId) && (includeSuppressed || visible(value)));
  const rows = [
    ...articles.map(articleRow),
    ...articles.flatMap(article => (
      (Array.isArray(article?.highlights) ? article.highlights : [])
        .map(highlight => plain(highlight))
        .filter(highlight => id(highlight))
        .map(highlight => highlightRow(article, highlight))
    )),
    ...notes.map(noteRow)
  ];
  const sourceByKey = new Map(rows.map(row => [
    refKey(row.source.type, row.source.id, row.source.parentId),
    row
  ]));
  const sourceKeysByLooseKey = new Map();
  rows.forEach(row => {
    const looseKey = looseRefKey(row.source.type, row.source.id);
    if (!sourceKeysByLooseKey.has(looseKey)) sourceKeysByLooseKey.set(looseKey, []);
    sourceKeysByLooseKey.get(looseKey).push(
      refKey(row.source.type, row.source.id, row.source.parentId)
    );
  });
  const usageByKey = new Map(Array.from(sourceByKey.keys()).map(key => [key, []]));
  const movementByKey = new Map();
  const idsByType = Object.fromEntries(SOURCE_TYPES.map(type => [
    type,
    rows.filter(row => row.source.type === type).map(row => row.source.id)
  ]));

  const [conceptRows, pageRows, connectionRows, edgeRows, movements] = await Promise.all([
    TagMeta?.find
      ? awaitQuery(TagMeta.find({
        userId,
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true },
        $or: [
          { pinnedArticleIds: { $in: idsByType.article } },
          { pinnedHighlightIds: { $in: idsByType.highlight } },
          { pinnedNoteIds: { $in: idsByType.note } }
        ]
      }), {
        select: '_id userId name pinnedArticleIds pinnedHighlightIds pinnedNoteIds',
        sort: { _id: 1 },
        limit: MIXED_SOURCE_SCAN_LIMIT + 1
      })
      : [],
    WikiPage?.find
      ? awaitQuery(WikiPage.find({
        userId,
        'sourceRefs.objectId': { $in: [...idsByType.article, ...idsByType.highlight, ...idsByType.note] },
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true },
        status: { $ne: 'archived' }
      }), {
        select: '_id userId title pageType status plainText aiState sourceRefs claims',
        sort: { _id: 1 },
        limit: MIXED_SOURCE_SCAN_LIMIT + 1
      })
      : [],
    Connection?.find
      ? awaitQuery(Connection.find({
        userId,
        $or: SOURCE_TYPES.flatMap(type => persistedTypesFor(type).flatMap(persistedType => ([
          { fromType: persistedType, fromId: { $in: idsByType[type] } },
          { toType: persistedType, toId: { $in: idsByType[type] } }
        ])))
      }), {
        select: '_id userId fromType fromId toType toId relationType createdAt',
        sort: { _id: 1 },
        limit: MIXED_SOURCE_SCAN_LIMIT + 1
      })
      : [],
    ReferenceEdge?.find
      ? awaitQuery(ReferenceEdge.find({
        userId,
        $or: SOURCE_TYPES.flatMap(type => persistedTypesFor(type).flatMap(persistedType => ([
          { sourceType: persistedType, sourceId: { $in: idsByType[type] } },
          { targetType: persistedType, targetId: { $in: idsByType[type] } }
        ])))
      }), {
        select: '_id userId sourceType sourceId targetType targetId targetTagName createdAt',
        sort: { _id: 1 },
        limit: MIXED_SOURCE_SCAN_LIMIT + 1
      })
      : [],
    typeof movementBuilder === 'function'
      ? movementBuilder({ userId, models, since: null, limit: 50 })
      : []
  ]);

  const concepts = (Array.isArray(conceptRows) ? conceptRows : []).slice(0, MIXED_SOURCE_SCAN_LIMIT)
    .map(plain)
    .filter(value => ownedBy(value, userId) && visible(value));
  const pages = (Array.isArray(pageRows) ? pageRows : []).slice(0, MIXED_SOURCE_SCAN_LIMIT)
    .map(plain)
    .filter(value => (
      ownedBy(value, userId)
      && visible(value)
      && clean(value?.status, 80).toLowerCase() !== 'archived'
      && isWikiPageSurfaceEligible(value)
    ));
  const connections = (Array.isArray(connectionRows) ? connectionRows : []).slice(0, MIXED_SOURCE_SCAN_LIMIT)
    .map(plain)
    .filter(value => ownedBy(value, userId));
  const edges = (Array.isArray(edgeRows) ? edgeRows : []).slice(0, MIXED_SOURCE_SCAN_LIMIT)
    .map(plain)
    .filter(value => ownedBy(value, userId));
  const conceptById = new Map(concepts.map(concept => [id(concept), concept]));
  const conceptByName = new Map(concepts.map(concept => [clean(concept.name, 180), concept]));
  const pageById = new Map(pages.map(page => [id(page), page]));
  const keysFor = (type, objectId, parentId = '') => {
    const exact = refKey(type, objectId, parentId);
    if (parentId && sourceByKey.has(exact)) return [exact];
    return sourceKeysByLooseKey.get(looseRefKey(type, objectId)) || [];
  };
  const attach = (type, objectId, ref, parentId = '') => {
    if (!ref) return;
    keysFor(type, objectId, parentId).forEach(key => usageByKey.get(key)?.push(ref));
  };

  concepts.forEach(concept => {
    (concept.pinnedArticleIds || []).forEach(value => attach('article', value, conceptRef(concept)));
    (concept.pinnedHighlightIds || []).forEach(value => attach('highlight', value, conceptRef(concept)));
    (concept.pinnedNoteIds || []).forEach(value => attach('note', value, conceptRef(concept)));
  });
  pages.forEach(page => {
    (Array.isArray(page.sourceRefs) ? page.sourceRefs : []).forEach(sourceRef => {
      const type = normalizeType(sourceRef?.type);
      const matchingKeys = keysFor(type, sourceRef?.objectId, sourceRef?.parentObjectId);
      if (!matchingKeys.length) return;
      attach(type, sourceRef.objectId, wikiPageRef(page), sourceRef?.parentObjectId);
      const sourceRefId = id(sourceRef);
      (Array.isArray(page.claims) ? page.claims : []).forEach(claim => {
        if ((claim?.sourceRefIds || []).some(value => id(value) === sourceRefId)) {
          attach(type, sourceRef.objectId, wikiClaimRef(page, claim), sourceRef?.parentObjectId);
        }
      });
    });
  });

  const linkedRef = (type, objectId, fallbackName = '') => {
    const normalized = normalizeType(type);
    if (normalized === 'concept') {
      const concept = conceptById.get(id(objectId)) || conceptByName.get(clean(fallbackName, 180));
      return concept ? conceptRef(concept) : null;
    }
    if (normalized === 'wiki_page') {
      const page = pageById.get(id(objectId));
      return page ? wikiPageRef(page) : null;
    }
    // Source-to-source edges are useful provenance, but they do not prove that
    // either source has entered a durable thinking object. Keep active and
    // unconnected semantics aligned with the article-only Library contract.
    if (SOURCE_TYPES.includes(normalized)) return null;
    return null;
  };
  connections.forEach(connection => {
    const endpoints = [
      { type: connection.fromType, objectId: connection.fromId, otherType: connection.toType, otherId: connection.toId },
      { type: connection.toType, objectId: connection.toId, otherType: connection.fromType, otherId: connection.fromId }
    ];
    endpoints.forEach(endpoint => {
      if (!keysFor(endpoint.type, endpoint.objectId).length) return;
      attach(endpoint.type, endpoint.objectId, linkedRef(endpoint.otherType, endpoint.otherId));
    });
  });
  edges.forEach(edge => {
    const endpoints = [
      {
        type: edge.sourceType,
        objectId: edge.sourceId,
        otherType: edge.targetType,
        otherId: edge.targetId,
        otherName: edge.targetTagName
      },
      {
        type: edge.targetType,
        objectId: edge.targetId,
        otherType: edge.sourceType,
        otherId: edge.sourceId,
        otherName: ''
      }
    ];
    endpoints.forEach(endpoint => {
      if (!keysFor(endpoint.type, endpoint.objectId).length) return;
      attach(
        endpoint.type,
        endpoint.objectId,
        linkedRef(endpoint.otherType, endpoint.otherId, endpoint.otherName)
      );
    });
  });

  (Array.isArray(movements) ? movements : []).forEach(movement => {
    const requiresReview = movement?.kind === 'contradiction'
      || movement?.reviewState === 'candidate'
      || (Array.isArray(movement?.unresolved) && movement.unresolved.length > 0);
    (Array.isArray(movement?.evidence) ? movement.evidence : []).forEach(evidence => {
      keysFor(evidence?.type, evidence?.id, evidence?.parentId).forEach(key => {
        if (!movementByKey.has(key)) movementByKey.set(key, []);
        movementByKey.get(key).push({
          id: clean(movement?.id, 180),
          kind: clean(movement?.kind, 80),
          title: clean(movement?.title),
          occurredAt: movement?.occurredAt,
          subject: movement?.subject || null,
          requiresReview
        });
      });
    });
  });

  rows.forEach(row => {
    const key = refKey(row.source.type, row.source.id, row.source.parentId);
    const connected = uniqueRefs(usageByKey.get(key) || []);
    const sourceMovements = movementByKey.get(key) || [];
    row.relevance = {
      connected,
      movements: sourceMovements,
      connectedCount: connected.length,
      movementCount: sourceMovements.length
    };
  });

  const selectedByView = Object.fromEntries(VIEW_NAMES.map(name => [
    name,
    rows.filter(row => classify(row, name)).sort((left, right) => (
      compareTuples(rowTuple(left), rowTuple(right))
    ))
  ]));
  const selected = selectedByView[view];
  const afterCursor = decodedCursor
    ? selected.filter(row => compareTuples(rowTuple(row), decodedCursor.tuple) > 0)
    : selected;
  const pageRowsSelected = afterCursor.slice(0, limit);
  const hasMore = afterCursor.length > pageRowsSelected.length;
  const nextCursor = hasMore && pageRowsSelected.length
    ? encodeCursor({ view, tuple: rowTuple(pageRowsSelected[pageRowsSelected.length - 1]) })
    : null;

  const articlesComplete = Number.isFinite(articleTotal) && articleTotal <= MIXED_SOURCE_SCAN_LIMIT;
  const notesComplete = Number.isFinite(noteTotal) && noteTotal <= MIXED_SOURCE_SCAN_LIMIT;
  const completeScan = articlesComplete && notesComplete;
  const limitations = ['material_movements_limited_to_50'];
  if (!Number.isFinite(articleTotal)) limitations.push('article_total_unavailable');
  if (!Number.isFinite(noteTotal)) limitations.push('note_total_unavailable');
  if (Number.isFinite(articleTotal) && articleTotal > MIXED_SOURCE_SCAN_LIMIT) {
    limitations.push('article_scan_limited_to_1000');
  }
  if (Number.isFinite(noteTotal) && noteTotal > MIXED_SOURCE_SCAN_LIMIT) {
    limitations.push('note_scan_limited_to_1000');
  }
  if ((conceptRows?.length || 0) > MIXED_SOURCE_SCAN_LIMIT) limitations.push('concept_scan_limited_to_1000');
  if ((pageRows?.length || 0) > MIXED_SOURCE_SCAN_LIMIT) limitations.push('wiki_page_scan_limited_to_1000');
  if ((connectionRows?.length || 0) > MIXED_SOURCE_SCAN_LIMIT) limitations.push('connection_scan_limited_to_1000');
  if ((edgeRows?.length || 0) > MIXED_SOURCE_SCAN_LIMIT) limitations.push('reference_edge_scan_limited_to_1000');
  const highlightCount = rows.filter(row => row.source.type === 'highlight').length;

  return {
    sources: pageRowsSelected,
    counts: Object.fromEntries(VIEW_NAMES.map(name => [name, {
      value: selectedByView[name].length,
      exact: completeScan && name === 'recent'
    }])),
    nextCursor,
    hasMore,
    coverage: {
      status: 'partial',
      sourceTypes: SOURCE_TYPES,
      scanned: {
        articles: articles.length,
        highlights: highlightCount,
        notes: notes.length
      },
      eligible: {
        articles: Number.isFinite(articleTotal) ? articleTotal : null,
        highlights: articlesComplete ? highlightCount : null,
        notes: Number.isFinite(noteTotal) ? noteTotal : null
      },
      limitations
    }
  };
};

module.exports = {
  MIXED_SOURCE_SCAN_LIMIT,
  SOURCE_TYPES,
  VIEW_NAMES,
  buildMixedLibraryRelevancePage,
  decodeCursor,
  encodeCursor,
  rowTuple
};
