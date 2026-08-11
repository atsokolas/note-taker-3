const { buildKnowledgeMovements } = require('./knowledgeMovementService');
const { isWikiPageSurfaceEligible } = require('./wikiPageQualityGuard');

const LIBRARY_RELEVANCE_VIEWS = Object.freeze([
  'recent',
  'active',
  'needs_review',
  'unconnected'
]);
const LIBRARY_RELEVANCE_SCAN_LIMIT = 1000;

const clean = (value = '', limit = 240) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1)).trim()}…` : text;
};
const isoOrNull = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const id = value => String(value?._id || value || '');
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const ownedBy = (record, userId) => id(record?.userId) === id(userId);
const visibleArticle = article => article
  && article.hiddenFromHome !== true
  && article.debugOnly !== true
  && article.archived !== true;
const uniqueRefs = refs => {
  const seen = new Set();
  return refs.filter(ref => {
    const key = `${ref?.type || ''}:${ref?.id || ''}:${ref?.parentId || ''}`;
    if (!ref?.type || !ref?.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const safeSourceUrl = value => {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch (_error) {
    return undefined;
  }
};

const articleRef = article => ({
  type: 'article',
  id: id(article),
  title: clean(article?.title || 'Untitled source'),
  href: `/library?articleId=${encodeURIComponent(id(article))}`,
  sourceUrl: safeSourceUrl(article?.url)
});

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

const awaitQuery = async (query, { sort, limit, select } = {}) => {
  let next = query;
  if (select && next?.select) next = next.select(select);
  if (sort && next?.sort) next = next.sort(sort);
  if (limit && next?.limit) next = next.limit(limit);
  if (next?.lean) next = next.lean();
  return await next;
};

const otherConnectionRef = ({ connection, articleId, conceptById, pageById }) => {
  const fromArticle = connection?.fromType === 'article' && id(connection.fromId) === articleId;
  const otherType = fromArticle ? connection?.toType : connection?.fromType;
  const otherId = id(fromArticle ? connection?.toId : connection?.fromId);
  if (otherType === 'concept' && conceptById.has(otherId)) return conceptRef(conceptById.get(otherId));
  if (['wiki', 'wiki_page'].includes(otherType) && pageById.has(otherId)) return wikiPageRef(pageById.get(otherId));
  return null;
};

const buildLibraryRelevance = async ({
  userId,
  models = {},
  view = 'recent',
  limit = 40,
  articleId = '',
  candidateLimit = null,
  movementBuilder = buildKnowledgeMovements
} = {}) => {
  if (!LIBRARY_RELEVANCE_VIEWS.includes(view)) {
    throw new Error(`Unsupported Library relevance view: ${view}`);
  }

  const {
    Article,
    TagMeta,
    WikiPage,
    Connection,
    ReferenceEdge
  } = models;
  if (!Article?.find) return [];

  const articleQuery = {
    userId,
    ...(articleId ? { _id: articleId } : {}),
    hiddenFromHome: { $ne: true },
    debugOnly: { $ne: true },
    archived: { $ne: true }
  };
  const articleRows = await awaitQuery(Article.find(articleQuery), {
    select: '_id userId title url author publicationDate siteName importMeta hiddenFromHome debugOnly archived createdAt updatedAt',
    sort: { createdAt: -1, _id: -1 },
    limit: articleId
      ? 1
      : candidateLimit || Math.max(limit * 8, 200)
  });
  const articles = (Array.isArray(articleRows) ? articleRows : [])
    .map(plain)
    .filter(article => (
      ownedBy(article, userId)
      && visibleArticle(article)
      && (!articleId || id(article) === id(articleId))
    ));
  const articleIds = articles.map(article => id(article));
  const movementPromise = view !== 'recent' && typeof movementBuilder === 'function'
    ? movementBuilder({
      userId,
      models,
      since: null,
      limit: 50
    })
    : Promise.resolve([]);

  const [conceptRows, pageRows, connectionRows, edgeRows] = await Promise.all([
    TagMeta?.find
      ? awaitQuery(TagMeta.find({
        userId,
        pinnedArticleIds: { $in: articleIds },
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true }
      }), {
        select: '_id userId name pinnedArticleIds',
        limit: Math.max(limit * 8, 200)
      })
      : [],
    WikiPage?.find
      ? awaitQuery(WikiPage.find({
        userId,
        'sourceRefs.objectId': { $in: articleIds },
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true }
      }), {
        select: '_id userId title pageType status plainText aiState sourceRefs claims',
        limit: Math.max(limit * 8, 200)
      })
      : [],
    Connection?.find
      ? awaitQuery(Connection.find({
        userId,
        $or: [
          { fromType: 'article', fromId: { $in: articleIds } },
          { toType: 'article', toId: { $in: articleIds } }
        ]
      }), {
        select: '_id userId fromType fromId toType toId relationType createdAt',
        limit: Math.max(limit * 20, 500)
      })
      : [],
    ReferenceEdge?.find
      ? awaitQuery(ReferenceEdge.find({
        userId,
        $or: [
          { sourceType: 'article', sourceId: { $in: articleIds } },
          { targetType: 'article', targetId: { $in: articleIds } }
        ]
      }), {
        select: '_id userId sourceType sourceId targetType targetId targetTagName createdAt',
        limit: Math.max(limit * 20, 500)
      })
      : []
  ]);

  const concepts = (Array.isArray(conceptRows) ? conceptRows : [])
    .map(plain)
    .filter(concept => ownedBy(concept, userId));
  const pages = (Array.isArray(pageRows) ? pageRows : [])
    .map(plain)
    .filter(page => ownedBy(page, userId) && isWikiPageSurfaceEligible(page));
  const connections = (Array.isArray(connectionRows) ? connectionRows : [])
    .map(plain)
    .filter(connection => ownedBy(connection, userId));
  const edges = (Array.isArray(edgeRows) ? edgeRows : [])
    .map(plain)
    .filter(edge => ownedBy(edge, userId));

  const conceptById = new Map(concepts.map(concept => [id(concept), concept]));
  const conceptByName = new Map(concepts.map(concept => [clean(concept.name, 180), concept]));
  const pageById = new Map(pages.map(page => [id(page), page]));
  const usageByArticleId = new Map(articles.map(article => [id(article), []]));
  const movementByArticleId = new Map();

  const attach = (articleId, ref) => {
    if (!usageByArticleId.has(articleId) || !ref) return;
    usageByArticleId.get(articleId).push(ref);
  };

  concepts.forEach(concept => {
    (Array.isArray(concept.pinnedArticleIds) ? concept.pinnedArticleIds : [])
      .forEach(articleId => attach(id(articleId), conceptRef(concept)));
  });

  pages.forEach(page => {
    const sourceRefs = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
    sourceRefs.forEach(sourceRef => {
      if (sourceRef?.type !== 'article' || !sourceRef?.objectId) return;
      const sourceArticleId = id(sourceRef.objectId);
      attach(sourceArticleId, wikiPageRef(page));
      const sourceRefId = id(sourceRef);
      (Array.isArray(page.claims) ? page.claims : []).forEach(claim => {
        if ((Array.isArray(claim?.sourceRefIds) ? claim.sourceRefIds : []).some(value => id(value) === sourceRefId)) {
          attach(sourceArticleId, wikiClaimRef(page, claim));
        }
      });
    });
  });

  connections.forEach(connection => {
    const articleIds = [];
    if (connection.fromType === 'article') articleIds.push(id(connection.fromId));
    if (connection.toType === 'article') articleIds.push(id(connection.toId));
    articleIds.forEach(articleId => attach(articleId, otherConnectionRef({
      connection,
      articleId,
      conceptById,
      pageById
    })));
  });

  edges.forEach(edge => {
    if (edge.sourceType === 'article' && usageByArticleId.has(id(edge.sourceId))) {
      const targetConcept = edge.targetType === 'concept'
        ? conceptById.get(id(edge.targetId)) || conceptByName.get(clean(edge.targetTagName, 180))
        : null;
      const targetPage = ['wiki', 'wiki_page'].includes(edge.targetType)
        ? pageById.get(id(edge.targetId))
        : null;
      attach(id(edge.sourceId), targetConcept
        ? conceptRef(targetConcept)
        : targetPage
          ? wikiPageRef(targetPage)
          : null);
    }
    if (edge.targetType === 'article' && usageByArticleId.has(id(edge.targetId))) {
      const sourceConcept = edge.sourceType === 'concept'
        ? conceptById.get(id(edge.sourceId))
        : null;
      const sourcePage = ['wiki', 'wiki_page'].includes(edge.sourceType)
        ? pageById.get(id(edge.sourceId))
        : null;
      attach(id(edge.targetId), sourceConcept
        ? conceptRef(sourceConcept)
        : sourcePage
          ? wikiPageRef(sourcePage)
          : null);
    }
  });

  if (view !== 'recent' && typeof movementBuilder === 'function') {
    const movements = await movementPromise;
    (Array.isArray(movements) ? movements : []).forEach(movement => {
      const requiresReview = movement?.kind === 'contradiction'
        || movement?.reviewState === 'candidate'
        || (Array.isArray(movement?.unresolved) && movement.unresolved.length > 0);
      if (!requiresReview && !['new_evidence', 'claim_changed'].includes(movement?.kind)) return;
      (Array.isArray(movement.evidence) ? movement.evidence : []).forEach(evidence => {
        if (evidence?.type !== 'article' || !usageByArticleId.has(id(evidence.id))) return;
        const articleId = id(evidence.id);
        if (!movementByArticleId.has(articleId)) movementByArticleId.set(articleId, []);
        movementByArticleId.get(articleId).push({
          id: clean(movement.id, 180),
          kind: clean(movement.kind, 80),
          title: clean(movement.title),
          occurredAt: movement.occurredAt,
          subject: movement.subject,
          requiresReview
        });
      });
    });
  }

  const rows = articles.map(article => {
    const articleId = id(article);
    const connected = uniqueRefs(usageByArticleId.get(articleId) || []);
    const movements = movementByArticleId.get(articleId) || [];
    return {
      source: articleRef(article),
      createdAt: isoOrNull(article.importMeta?.importedAt || article.createdAt),
      provenance: {
        provider: clean(article.importMeta?.provider || article.siteName || 'saved_source', 100),
        sourceType: clean(article.importMeta?.sourceType, 100) || null,
        sourceLabel: clean(article.importMeta?.sourceLabel, 160) || null,
        importedAt: isoOrNull(article.importMeta?.importedAt),
        siteName: clean(article.siteName, 160) || null,
        author: clean(article.author, 160) || null,
        publicationDate: clean(article.publicationDate, 80) || null
      },
      relevance: {
        connected,
        movements,
        connectedCount: connected.length,
        movementCount: movements.length
      }
    };
  });

  const selected = rows.filter(row => {
    if (articleId) return true;
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
  });

  selected.sort((left, right) => {
    if (view === 'needs_review') {
      const movementTime = row => Math.max(
        0,
        ...row.relevance.movements.map(item => new Date(item.occurredAt || 0).getTime() || 0)
      );
      const delta = movementTime(right) - movementTime(left);
      if (delta) return delta;
    }
    if (view === 'active') {
      const delta = right.relevance.connectedCount - left.relevance.connectedCount;
      if (delta) return delta;
    }
    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
      || right.source.id.localeCompare(left.source.id);
  });

  return selected.slice(0, limit);
};

const buildLibraryRelevancePage = async ({
  userId,
  models = {},
  view = 'recent',
  limit = 40,
  movementBuilder = buildKnowledgeMovements
} = {}) => {
  const visibleQuery = {
    userId,
    hiddenFromHome: { $ne: true },
    debugOnly: { $ne: true },
    archived: { $ne: true }
  };
  const total = models.Article?.countDocuments
    ? await models.Article.countDocuments(visibleQuery)
    : null;
  const matching = await buildLibraryRelevance({
    userId,
    models,
    view,
    limit: LIBRARY_RELEVANCE_SCAN_LIMIT,
    candidateLimit: LIBRARY_RELEVANCE_SCAN_LIMIT,
    movementBuilder
  });
  const scanned = Number.isFinite(total)
    ? Math.min(total, LIBRARY_RELEVANCE_SCAN_LIMIT)
    : LIBRARY_RELEVANCE_SCAN_LIMIT;
  const partial = !Number.isFinite(total) || total > LIBRARY_RELEVANCE_SCAN_LIMIT;
  const limitations = [];
  if (!Number.isFinite(total)) limitations.push('article_total_unavailable');
  if (Number.isFinite(total) && total > LIBRARY_RELEVANCE_SCAN_LIMIT) {
    limitations.push('article_scan_limited_to_1000');
  }
  if (view !== 'recent') limitations.push('material_movements_limited_to_50');

  return {
    sources: matching.slice(0, limit),
    counts: {
      [view]: {
        value: matching.length,
        exact: !partial && view === 'recent'
      }
    },
    coverage: {
      status: partial || view !== 'recent' ? 'partial' : 'complete',
      sourceTypes: ['article'],
      scanned: { articles: scanned },
      eligible: { articles: Number.isFinite(total) ? total : null },
      limitations
    }
  };
};

const buildLibrarySourceDetail = async ({
  userId,
  articleId,
  models = {},
  movementBuilder = buildKnowledgeMovements
} = {}) => {
  const sources = await buildLibraryRelevance({
    userId,
    models,
    view: 'recent',
    limit: 1,
    articleId,
    movementBuilder
  });
  return sources[0] || null;
};

module.exports = {
  LIBRARY_RELEVANCE_VIEWS,
  LIBRARY_RELEVANCE_SCAN_LIMIT,
  buildLibraryRelevance,
  buildLibraryRelevancePage,
  buildLibrarySourceDetail,
  safeSourceUrl
};
