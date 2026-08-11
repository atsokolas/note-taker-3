const { buildKnowledgeMovements } = require('./knowledgeMovementService');

const FIELD_ALPHA_THRESHOLDS = Object.freeze({
  verifiedMovements: 6,
  navigableEdges: 10,
  connectedObjects: 8,
  activeTerritories: 3
});

const SUPPORTED_NODE_TYPES = new Set([
  'article', 'highlight', 'notebook', 'concept', 'question', 'wiki_page', 'wiki_claim'
]);
const REFERENCE_TARGET_TYPES = new Set(['article', 'highlight', 'question', 'concept']);
const INVERSE_CONNECTION_RELATION_TYPES = Object.freeze({
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
});
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const id = value => String(value?._id || value?.id || value || '').trim();
const clean = value => String(value || '').trim().toLowerCase();
const list = value => Array.isArray(value) ? value : [];
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const inSession = (query, session) => session && query?.session ? query.session(session) : query;
const awaitQuery = async query => await (query?.lean ? query.lean() : query);
const owned = (value, userId) => id(value?.userId) === id(userId);
const visible = value => Boolean(
  value
  && value.archived !== true
  && value.hiddenFromHome !== true
  && value.debugOnly !== true
);
const visibleWikiPage = value => visible(value) && value.status !== 'archived';
const isObjectId = value => OBJECT_ID_RE.test(id(value));
const canonicalNodeType = value => {
  const type = clean(value);
  if (type === 'note') return 'notebook';
  if (type === 'tag' || type === 'tagmeta') return 'concept';
  return SUPPORTED_NODE_TYPES.has(type) ? type : '';
};
const nodeKey = (type, objectId) => {
  const safeType = canonicalNodeType(type);
  const safeId = id(objectId);
  return safeType && safeId ? `${safeType}:${safeId}` : '';
};
const edgeKey = (left, right) => [left, right].sort().join('|');
const endpoint = (type, objectId, name = '') => ({
  type: canonicalNodeType(type),
  objectId: id(objectId),
  name: clean(name)
});

const connectionPair = connection => {
  const left = endpoint(connection?.fromType, connection?.fromId);
  const right = endpoint(connection?.toType, connection?.toId);
  return left.type && left.objectId && right.type && right.objectId ? [left, right] : null;
};

const connectionDirectionKey = connection => [
  canonicalNodeType(connection?.fromType),
  id(connection?.fromId),
  canonicalNodeType(connection?.toType),
  id(connection?.toId),
  clean(connection?.relationType),
  clean(connection?.scopeType),
  id(connection?.scopeId)
].join('|');

const hasExactReciprocalConnection = (connection, directions) => {
  const inverseRelation = INVERSE_CONNECTION_RELATION_TYPES[clean(connection?.relationType)];
  if (!inverseRelation) return false;
  return directions.has([
    canonicalNodeType(connection?.toType),
    id(connection?.toId),
    canonicalNodeType(connection?.fromType),
    id(connection?.fromId),
    inverseRelation,
    clean(connection?.scopeType),
    id(connection?.scopeId)
  ].join('|'));
};

const referencePair = edge => {
  const left = endpoint(edge?.sourceType, edge?.sourceId);
  const targetType = canonicalNodeType(edge?.targetType);
  const right = endpoint(targetType, edge?.targetId, edge?.targetTagName);
  if (left.type !== 'notebook' || !left.objectId || !REFERENCE_TARGET_TYPES.has(targetType)) return null;
  if (!right.objectId && !(targetType === 'concept' && right.name)) return null;
  return [left, right];
};

const traceableMovement = movement => Boolean(
  movement?.id
  && movement?.kind
  && movement?.subject?.id
  && movement?.subject?.href
  && list(movement?.provenance?.deterministicFacts).length
  && (
    list(movement?.provenance?.eventIds).length
    || list(movement?.provenance?.revisionIds).length
    || ['decision_due', 'outcome_due'].includes(movement.kind)
  )
);

const queryRows = async ({ model, query, select, session }) => {
  if (!model?.find) return [];
  let result = model.find(query);
  result = result.select?.(select) || result;
  result = inSession(result, session);
  return list(await awaitQuery(result)).map(plain);
};

const idsForType = (endpoints, type) => Array.from(new Set(
  endpoints
    .filter(value => value?.type === type && isObjectId(value.objectId))
    .map(value => value.objectId)
));

const parseWikiClaim = value => {
  const [pageId, ...claimParts] = id(value).split(':');
  const claimId = claimParts.join(':');
  return isObjectId(pageId) && claimId ? { pageId, claimId, raw: id(value) } : null;
};

const resolveDurableNodes = async ({ userId, endpoints, concepts, models, session }) => {
  const articleIds = idsForType(endpoints, 'article');
  const highlightIds = idsForType(endpoints, 'highlight');
  const notebookIds = idsForType(endpoints, 'notebook');
  const questionIds = idsForType(endpoints, 'question');
  const wikiPageIds = idsForType(endpoints, 'wiki_page');
  const wikiClaims = endpoints
    .filter(value => value?.type === 'wiki_claim')
    .map(value => parseWikiClaim(value.objectId))
    .filter(Boolean);
  const claimPageIds = Array.from(new Set(wikiClaims.map(value => value.pageId)));
  const allWikiPageIds = Array.from(new Set([...wikiPageIds, ...claimPageIds]));
  const articleMatch = [];
  if (articleIds.length) articleMatch.push({ _id: { $in: articleIds } });
  if (highlightIds.length) articleMatch.push({ 'highlights._id': { $in: highlightIds } });

  const [articles, notebooks, questions, wikiPages] = await Promise.all([
    articleMatch.length ? queryRows({
      model: models.Article,
      query: { userId, $or: articleMatch },
      select: '_id userId highlights._id archived hiddenFromHome debugOnly',
      session
    }) : [],
    notebookIds.length ? queryRows({
      model: models.NotebookEntry,
      query: { userId, _id: { $in: notebookIds } },
      select: '_id userId archived hiddenFromHome debugOnly',
      session
    }) : [],
    questionIds.length ? queryRows({
      model: models.Question,
      query: { userId, _id: { $in: questionIds } },
      select: '_id userId archived hiddenFromHome debugOnly',
      session
    }) : [],
    allWikiPageIds.length ? queryRows({
      model: models.WikiPage,
      query: { userId, _id: { $in: allWikiPageIds }, status: { $ne: 'archived' } },
      select: '_id userId status claims.claimId archived hiddenFromHome debugOnly',
      session
    }) : []
  ]);

  const resolved = new Set();
  const wantedArticleIds = new Set(articleIds);
  const wantedHighlightIds = new Set(highlightIds);
  articles.filter(value => owned(value, userId) && visible(value)).forEach(article => {
    const articleId = id(article);
    if (wantedArticleIds.has(articleId)) resolved.add(nodeKey('article', articleId));
    list(article.highlights).forEach(highlight => {
      const highlightId = id(highlight);
      if (wantedHighlightIds.has(highlightId)) resolved.add(nodeKey('highlight', highlightId));
    });
  });
  notebooks.filter(value => owned(value, userId) && visible(value)).forEach(value => {
    resolved.add(nodeKey('notebook', id(value)));
  });
  questions.filter(value => owned(value, userId) && visible(value)).forEach(value => {
    resolved.add(nodeKey('question', id(value)));
  });

  const visibleConcepts = concepts.filter(value => owned(value, userId) && visible(value));
  const conceptByName = new Map();
  visibleConcepts.forEach(concept => {
    resolved.add(nodeKey('concept', id(concept)));
    const name = clean(concept.name);
    if (!name) return;
    const matches = conceptByName.get(name) || [];
    matches.push(id(concept));
    conceptByName.set(name, matches);
  });

  const pageById = new Map();
  wikiPages.filter(value => owned(value, userId) && visibleWikiPage(value)).forEach(page => {
    const pageId = id(page);
    pageById.set(pageId, page);
    if (wikiPageIds.includes(pageId)) resolved.add(nodeKey('wiki_page', pageId));
  });
  wikiClaims.forEach(ref => {
    const page = pageById.get(ref.pageId);
    if (!page) return;
    if (list(page.claims).some(claim => id(claim?.claimId) === ref.claimId)) {
      resolved.add(nodeKey('wiki_claim', ref.raw));
    }
  });

  const resolveEndpoint = value => {
    if (!value?.type) return '';
    if (value.objectId) {
      const key = nodeKey(value.type, value.objectId);
      return resolved.has(key) ? key : '';
    }
    if (value.type !== 'concept' || !value.name) return '';
    const matches = conceptByName.get(value.name) || [];
    return matches.length === 1 ? nodeKey('concept', matches[0]) : '';
  };

  return { resolved, resolveEndpoint };
};

const gapFor = ({ code, label, current, required }) => (
  current >= required ? null : {
    code,
    current,
    required,
    message: `${label}: ${current} of ${required} required for the Field alpha.`
  }
);

const buildFieldReadiness = async ({
  userId,
  models = {},
  asOf = new Date(),
  thresholds = FIELD_ALPHA_THRESHOLDS,
  session = null,
  movementBuilder = buildKnowledgeMovements
} = {}) => {
  if (!userId) throw new Error('buildFieldReadiness requires a userId.');
  const safeAsOf = asOf instanceof Date ? asOf : new Date(asOf);
  if (Number.isNaN(safeAsOf.getTime())) throw new Error('asOf must be a valid date.');

  const connectionQuery = models.Connection?.find
    ? models.Connection.find({ userId }).select?.('_id userId fromType fromId toType toId relationType scopeType scopeId')
      || models.Connection.find({ userId })
    : [];
  const referenceQuery = models.ReferenceEdge?.find
    ? models.ReferenceEdge.find({ userId }).select?.('_id userId sourceType sourceId targetType targetId targetTagName')
      || models.ReferenceEdge.find({ userId })
    : [];
  const conceptQuery = models.TagMeta?.find
    ? models.TagMeta.find({ userId, archived: { $ne: true }, hiddenFromHome: { $ne: true }, debugOnly: { $ne: true } })
      .select?.('_id userId name archived hiddenFromHome debugOnly')
      || models.TagMeta.find({ userId })
    : [];

  const [movements, connectionsRaw, referenceEdgesRaw, conceptsRaw] = await Promise.all([
    movementBuilder({ userId, models, limit: 50, asOf: safeAsOf }),
    awaitQuery(inSession(connectionQuery, session)),
    awaitQuery(inSession(referenceQuery, session)),
    awaitQuery(inSession(conceptQuery, session))
  ]);

  const connections = list(connectionsRaw).map(plain).filter(value => owned(value, userId));
  const referenceEdges = list(referenceEdgesRaw).map(plain).filter(value => owned(value, userId));
  const concepts = list(conceptsRaw).map(plain).filter(value => owned(value, userId) && visible(value));
  const connectionDirections = new Set(connections.map(connectionDirectionKey));
  const reciprocalConnections = connections.filter(connection => (
    hasExactReciprocalConnection(connection, connectionDirections)
  ));
  const rawPairs = [
    ...reciprocalConnections.map(connectionPair),
    ...referenceEdges.map(referencePair)
  ];
  const endpoints = rawPairs.filter(Boolean).flat();
  const { resolveEndpoint } = await resolveDurableNodes({
    userId, endpoints, concepts, models, session
  });
  const durablePairs = [];
  let unresolvedEdges = connections.length - reciprocalConnections.length;
  rawPairs.forEach(pair => {
    if (!pair) {
      unresolvedEdges += 1;
      return;
    }
    const left = resolveEndpoint(pair[0]);
    const right = resolveEndpoint(pair[1]);
    if (!left || !right || left === right) {
      unresolvedEdges += 1;
      return;
    }
    durablePairs.push([left, right]);
  });
  const uniquePairs = Array.from(new Map(durablePairs.map(pair => [edgeKey(...pair), pair])).values());
  const connectedNodes = new Set(uniquePairs.flat());
  const conceptIds = new Set(concepts.map(value => id(value)).filter(Boolean));
  const activeTerritoryIds = new Set();
  connectedNodes.forEach(key => {
    const separator = key.indexOf(':');
    const type = separator === -1 ? '' : key.slice(0, separator);
    const objectId = separator === -1 ? '' : key.slice(separator + 1);
    if (type === 'concept' && conceptIds.has(objectId)) activeTerritoryIds.add(objectId);
  });
  const verifiedMovements = Array.from(new Map(
    list(movements).filter(traceableMovement).map(value => [String(value.id), value])
  ).values());
  const metrics = {
    verifiedMovements: verifiedMovements.length,
    navigableEdges: uniquePairs.length,
    connectedObjects: connectedNodes.size,
    activeTerritories: activeTerritoryIds.size,
    unresolvedEdges
  };
  const gaps = [
    gapFor({ code: 'movement_density', label: 'Verified movements', current: metrics.verifiedMovements, required: thresholds.verifiedMovements }),
    gapFor({ code: 'edge_density', label: 'Navigable edges', current: metrics.navigableEdges, required: thresholds.navigableEdges }),
    gapFor({ code: 'object_density', label: 'Connected objects', current: metrics.connectedObjects, required: thresholds.connectedObjects }),
    gapFor({ code: 'territory_density', label: 'Active Concept territories', current: metrics.activeTerritories, required: thresholds.activeTerritories })
  ].filter(Boolean);

  return {
    version: 1,
    eligible: gaps.length === 0,
    state: gaps.length === 0 ? 'ready_for_field_alpha' : 'insufficient_verified_density',
    asOf: safeAsOf.toISOString(),
    thresholds: { ...thresholds },
    metrics,
    gaps,
    evidence: {
      movementIds: verifiedMovements.map(value => String(value.id)).sort(),
      territoryIds: Array.from(activeTerritoryIds).sort()
    }
  };
};

module.exports = {
  FIELD_ALPHA_THRESHOLDS,
  buildFieldReadiness,
  traceableMovement,
  canonicalNodeType,
  connectionPair,
  hasExactReciprocalConnection,
  referencePair,
  resolveDurableNodes
};
