// Any item by type and id, and the threads between items: the return queue, connections and their scopes, concept paths, and the graph.
const { stripHtml } = require('./notebookBlocks');
const mongoose = require('mongoose');
const {
  TagMeta,
  NotebookEntry,
  Question,
  Article,
  WikiPage,
  ReferenceEdge,
  Connection,
  ConceptPath,
  ConceptPathProgress
} = require('../models/index');
const { findHighlightById } = require('./highlightLookup');

const RETURN_QUEUE_ITEM_TYPES = new Set(['highlight', 'notebook', 'question', 'concept', 'article']);

const normalizeReturnQueueItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (RETURN_QUEUE_ITEM_TYPES.has(candidate)) return candidate;
  return '';
};

const parseDueAt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const buildUnavailableQueueItem = () => ({
  title: 'Unavailable item',
  snippet: 'This item could not be loaded.',
  openPath: '',
  exists: false
});

const decodeBasicHtmlEntities = (value = '') => (
  String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
);

const buildQueueSnippet = (...values) => {
  const first = values.find(value => String(value || '').trim());
  const clean = decodeBasicHtmlEntities(stripHtml(first || ''));
  return clean.slice(0, 280);
};

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveConceptByParam = async (userId, rawParam, { createIfMissing = false } = {}) => {
  const safeParam = String(rawParam || '').trim();
  if (!safeParam) return null;
  const userObjectId = new mongoose.Types.ObjectId(userId);
  if (mongoose.Types.ObjectId.isValid(safeParam)) {
    const byId = await TagMeta.findOne({ _id: safeParam, userId: userObjectId });
    if (byId) return byId;
  }
  const byName = await TagMeta.findOne({
    name: new RegExp(`^${escapeRegExp(safeParam)}$`, 'i'),
    userId: userObjectId
  });
  if (byName) return byName;
  if (!createIfMissing) return null;
  const created = await TagMeta.findOneAndUpdate(
    { name: safeParam, userId: userObjectId },
    { $setOnInsert: { name: safeParam } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return created;
};

const resolveReturnQueueItem = async (userId, itemType, itemId) => {
  const safeItemId = String(itemId || '').trim();
  if (!safeItemId) return null;
  if (itemType === 'highlight') {
    const highlight = await findHighlightById(userId, safeItemId);
    if (!highlight) return null;
    return {
      title: highlight.articleTitle || 'Highlight',
      snippet: buildQueueSnippet(highlight.text, highlight.note),
      articleId: highlight.articleId ? String(highlight.articleId) : '',
      openPath: highlight.articleId
        ? `/library?articleId=${highlight.articleId}&highlightId=${safeItemId}`
        : '',
      exists: true
    };
  }
  if (!mongoose.Types.ObjectId.isValid(safeItemId)) return null;
  if (itemType === 'notebook') {
    const entry = await NotebookEntry.findOne({ _id: safeItemId, userId })
      .select('title content blocks')
      .lean();
    if (!entry) return null;
    const blockText = Array.isArray(entry.blocks)
      ? entry.blocks.find(block => String(block?.text || '').trim())?.text
      : '';
    return {
      title: entry.title || 'Notebook entry',
      snippet: buildQueueSnippet(entry.content, blockText, entry.title),
      openPath: `/think?tab=notebook&entryId=${entry._id}`,
      exists: true
    };
  }
  if (itemType === 'question') {
    const question = await Question.findOne({ _id: safeItemId, userId })
      .select('text')
      .lean();
    if (!question) return null;
    return {
      title: 'Question',
      snippet: buildQueueSnippet(question.text),
      openPath: `/think?tab=questions&questionId=${question._id}`,
      exists: true
    };
  }
  if (itemType === 'concept') {
    const conceptQuery = mongoose.Types.ObjectId.isValid(safeItemId)
      ? { _id: safeItemId, userId }
      : { userId, name: new RegExp(`^${escapeRegExp(safeItemId)}$`, 'i') };
    const concept = await TagMeta.findOne(conceptQuery)
      .select('name description')
      .lean();
    if (!concept) return null;
    return {
      title: concept.name || 'Concept',
      snippet: buildQueueSnippet(concept.description, concept.name),
      openPath: `/think?tab=concepts&conceptId=${concept._id}`,
      exists: true
    };
  }
  if (itemType === 'article') {
    const article = await Article.findOne({ _id: safeItemId, userId })
      .select('title content')
      .lean();
    if (!article) return null;
    return {
      title: article.title || 'Article',
      snippet: buildQueueSnippet(article.content, article.title),
      openPath: `/library?articleId=${article._id}`,
      exists: true
    };
  }
  if (itemType === 'wiki_page') {
    const page = await WikiPage.findOne({ _id: safeItemId, userId, status: { $ne: 'archived' } })
      .select('title plainText pageType status')
      .lean();
    if (!page) return null;
    return {
      title: page.title || 'Wiki page',
      snippet: buildQueueSnippet(page.plainText, page.pageType),
      openPath: `/wiki/workspace?page=${page._id}`,
      exists: true
    };
  }
  if (itemType === 'wiki_claim') {
    const [pageId, ...claimParts] = safeItemId.split(':');
    const claimId = claimParts.join(':');
    if (!mongoose.Types.ObjectId.isValid(pageId) || !claimId) return null;
    const page = await WikiPage.findOne({ _id: pageId, userId, status: { $ne: 'archived' } })
      .select('title claims updatedAt')
      .lean();
    if (!page) return null;
    const claim = (Array.isArray(page.claims) ? page.claims : [])
      .find(row => String(row?.claimId || '') === claimId);
    if (!claim) return null;
    return {
      title: claim.section || 'Wiki claim',
      snippet: buildQueueSnippet(claim.text, page.title),
      openPath: `/wiki/workspace?page=${page._id}&claimId=${encodeURIComponent(claimId)}`,
      exists: true
    };
  }
  return null;
};

const CONNECTION_RELATION_TYPES = new Set([
  'supports',
  'supported_by',
  'contradicts',
  'contradicted_by',
  'extends',
  'related',
  'referenced_by',
  'example',
  'definition',
  'shared_source',
  'contains',
  'contained_by',
  'needs_review',
  'review_needed_by'
]);
const CONNECTION_ITEM_TYPES = new Set(['highlight', 'notebook', 'article', 'concept', 'question', 'wiki_page', 'wiki_claim']);
const CONNECTION_SCOPE_TYPES = new Set(['', 'article', 'concept', 'question']);

const normalizeConnectionItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'note') return 'notebook';
  if (CONNECTION_ITEM_TYPES.has(candidate)) return candidate;
  return '';
};

const normalizeRelationType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (CONNECTION_RELATION_TYPES.has(candidate)) return candidate;
  return '';
};

const normalizeConnectionScopeType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === '') return '';
  if (CONNECTION_SCOPE_TYPES.has(candidate)) return candidate;
  return null;
};

const resolveConnectionScope = async (userId, scopeType, scopeId) => {
  const safeScopeType = normalizeConnectionScopeType(scopeType);
  const safeScopeId = String(scopeId || '').trim();
  if (safeScopeType === null) return null;
  if (safeScopeType === '') {
    return { scopeType: '', scopeId: '', title: '' };
  }
  if (!safeScopeId) return null;
  if (safeScopeType === 'concept') {
    if (mongoose.Types.ObjectId.isValid(safeScopeId)) {
      const conceptById = await TagMeta.findOne({ _id: safeScopeId, userId }).select('name').lean();
      if (conceptById) {
        return {
          scopeType: 'concept',
          scopeId: String(conceptById._id),
          title: conceptById.name || 'Concept',
          conceptName: conceptById.name || ''
        };
      }
    }
    const conceptByName = await TagMeta.findOne({
      userId,
      name: new RegExp(`^${escapeRegExp(safeScopeId)}$`, 'i')
    }).select('name').lean();
    if (!conceptByName) return null;
    return {
      scopeType: 'concept',
      scopeId: String(conceptByName._id),
      title: conceptByName.name || 'Concept',
      conceptName: conceptByName.name || ''
    };
  }
  if (safeScopeType === 'article') {
    if (!mongoose.Types.ObjectId.isValid(safeScopeId)) return null;
    const article = await Article.findOne({ _id: safeScopeId, userId }).select('title').lean();
    if (!article) return null;
    return {
      scopeType: 'article',
      scopeId: String(article._id),
      title: article.title || 'Article'
    };
  }
  if (safeScopeType === 'question') {
    if (!mongoose.Types.ObjectId.isValid(safeScopeId)) return null;
    const question = await Question.findOne({ _id: safeScopeId, userId }).select('text').lean();
    if (!question) return null;
    return {
      scopeType: 'question',
      scopeId: String(safeScopeId),
      title: question.text || 'Question'
    };
  }
  return null;
};

const resolveConnectionItem = async (userId, itemType, itemId) => {
  const normalizedType = normalizeConnectionItemType(itemType);
  if (!normalizedType) return null;
  return resolveReturnQueueItem(userId, normalizedType, itemId);
};

const resolveConnectionScopeInput = async (userId, scopeType, scopeId, hasInput = false) => {
  if (!hasInput) return { scopeType: '', scopeId: '', title: '' };
  const scope = await resolveConnectionScope(userId, scopeType, scopeId);
  if (!scope) return null;
  return {
    scopeType: scope.scopeType || '',
    scopeId: scope.scopeId || '',
    title: scope.title || ''
  };
};

const toObjectIdList = (ids = []) => (
  ids
    .map(value => String(value || '').trim())
    .filter(value => mongoose.Types.ObjectId.isValid(value))
    .map(value => new mongoose.Types.ObjectId(value))
);

const normalizeConnectionScopeCandidates = (rows = []) => {
  const set = new Set();
  rows.forEach(row => {
    const value = String(row?._id || row || '').trim();
    if (value) set.add(value);
  });
  return set;
};

const createEmptyConnectionCandidateSets = () => ({
  highlightIds: new Set(),
  notebookIds: new Set(),
  articleIds: new Set(),
  conceptIds: new Set(),
  questionIds: new Set(),
  wikiPageIds: new Set(),
  wikiClaimIds: new Set()
});

const addToCandidateSet = (set, value) => {
  if (!set || typeof set.add !== 'function') return;
  const safe = String(value || '').trim();
  if (safe) set.add(safe);
};

const addManyToCandidateSet = (set, values = []) => {
  values.forEach(value => addToCandidateSet(set, value));
};

const addArticleIdsForHighlightIds = async (userId, highlightIds, articleSet) => {
  const highlightObjectIds = toObjectIdList(Array.from(highlightIds));
  if (!highlightObjectIds.length) return;
  const articleRows = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': { $in: highlightObjectIds } } },
    { $group: { _id: '$_id' } }
  ]);
  articleRows.forEach(row => addToCandidateSet(articleSet, row?._id));
};

const buildConnectionScopeCandidates = async (userId, scope) => {
  if (!scope?.scopeType || !scope?.scopeId) return null;

  if (scope.scopeType === 'concept') {
    const concept = await TagMeta.findOne({ _id: scope.scopeId, userId })
      .select('name pinnedHighlightIds pinnedNoteIds pinnedArticleIds')
      .lean();
    if (!concept) return null;

    const candidates = createEmptyConnectionCandidateSets();
    addToCandidateSet(candidates.conceptIds, concept._id);
    addManyToCandidateSet(candidates.highlightIds, normalizeConnectionScopeCandidates(concept.pinnedHighlightIds || []));
    addManyToCandidateSet(candidates.notebookIds, normalizeConnectionScopeCandidates(concept.pinnedNoteIds || []));
    addManyToCandidateSet(candidates.articleIds, normalizeConnectionScopeCandidates(concept.pinnedArticleIds || []));
    const conceptName = String(concept.name || '').trim();

    if (conceptName) {
      const regex = new RegExp(`^${escapeRegExp(conceptName)}$`, 'i');
      const taggedHighlights = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': regex } },
        { $project: { _id: '$highlights._id', articleId: '$_id' } },
        { $limit: 600 }
      ]);
      taggedHighlights.forEach(row => {
        addToCandidateSet(candidates.highlightIds, row?._id);
        addToCandidateSet(candidates.articleIds, row?.articleId);
      });

      const taggedNotes = await NotebookEntry.find({ userId, tags: regex })
        .select('_id')
        .lean();
      taggedNotes.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));

      const conceptQuestions = await Question.find({ userId, linkedTagName: regex })
        .select('_id')
        .limit(200)
        .lean();
      conceptQuestions.forEach(row => addToCandidateSet(candidates.questionIds, row?._id));

    const conceptReferenceEdges = await ReferenceEdge.find({
      userId: new mongoose.Types.ObjectId(userId),
      targetType: 'concept',
      targetTagName: regex
      })
        .select('sourceId')
      .lean();
      conceptReferenceEdges.forEach(edge => addToCandidateSet(candidates.notebookIds, edge?.sourceId));
    }

    const scopedWikiEdges = await Connection.find({
      userId,
      scopeType: 'concept',
      scopeId: String(concept._id),
      $or: [{ fromType: 'wiki_page' }, { toType: 'wiki_page' }]
    })
      .select('fromType fromId toType toId')
      .limit(300)
      .lean();
    scopedWikiEdges.forEach(edge => {
      if (edge?.fromType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.fromId);
      if (edge?.toType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.toId);
    });

    const highlightObjectIds = toObjectIdList(Array.from(candidates.highlightIds));
    if (highlightObjectIds.length > 0) {
      const notesLinkedToHighlights = await NotebookEntry.find({
        userId,
        linkedHighlightIds: { $in: highlightObjectIds }
      })
        .select('_id')
        .lean();
      notesLinkedToHighlights.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));
    }

    await addArticleIdsForHighlightIds(userId, candidates.highlightIds, candidates.articleIds);
    return candidates;
  }

  if (scope.scopeType === 'question') {
    const question = await Question.findOne({ _id: scope.scopeId, userId })
      .select('blocks linkedHighlightId linkedHighlightIds linkedNotebookEntryId linkedTagName')
      .lean();
    if (!question) return null;

    const candidates = createEmptyConnectionCandidateSets();
    addToCandidateSet(candidates.questionIds, question._id);
    addToCandidateSet(candidates.notebookIds, question.linkedNotebookEntryId);

    if (question.linkedTagName) {
      const linkedConcept = await TagMeta.findOne({
        userId,
        name: new RegExp(`^${escapeRegExp(question.linkedTagName)}$`, 'i')
      }).select('_id').lean();
      addToCandidateSet(candidates.conceptIds, linkedConcept?._id);
    }

    const addHighlightId = (value) => {
      const clean = String(value || '').trim();
      if (clean) candidates.highlightIds.add(clean);
    };

    addHighlightId(question.linkedHighlightId);
    (question.linkedHighlightIds || []).forEach(addHighlightId);
    (question.blocks || []).forEach(block => {
      if (block?.type === 'highlight-ref') addHighlightId(block.highlightId);
    });

    const highlightObjectIds = toObjectIdList(Array.from(candidates.highlightIds));
    if (highlightObjectIds.length > 0) {
      const notesLinkedToHighlights = await NotebookEntry.find({
        userId,
        linkedHighlightIds: { $in: highlightObjectIds }
      })
        .select('_id')
        .lean();
      notesLinkedToHighlights.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));
    }

    await addArticleIdsForHighlightIds(userId, candidates.highlightIds, candidates.articleIds);
    const scopedWikiEdges = await Connection.find({
      userId,
      scopeType: 'question',
      scopeId: String(question._id),
      $or: [{ fromType: 'wiki_page' }, { toType: 'wiki_page' }]
    })
      .select('fromType fromId toType toId')
      .limit(300)
      .lean();
    scopedWikiEdges.forEach(edge => {
      if (edge?.fromType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.fromId);
      if (edge?.toType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.toId);
    });
    return candidates;
  }

  if (scope.scopeType === 'article') {
    const article = await Article.findOne({ _id: scope.scopeId, userId })
      .select('highlights._id')
      .lean();
    if (!article) return null;

    const candidates = createEmptyConnectionCandidateSets();
    addToCandidateSet(candidates.articleIds, article._id);
    (article.highlights || []).forEach(highlight => addToCandidateSet(candidates.highlightIds, highlight?._id));

    const highlightObjectIds = toObjectIdList(Array.from(candidates.highlightIds));
    if (highlightObjectIds.length > 0) {
      const [notesLinkedToHighlights, questionsLinkedToHighlights] = await Promise.all([
        NotebookEntry.find({
          userId,
          linkedHighlightIds: { $in: highlightObjectIds }
        })
          .select('_id')
          .lean(),
        Question.find({
          userId,
          $or: [
            { linkedHighlightId: { $in: Array.from(candidates.highlightIds) } },
            { linkedHighlightIds: { $in: Array.from(candidates.highlightIds) } },
            { 'blocks.highlightId': { $in: Array.from(candidates.highlightIds) } }
          ]
        })
          .select('_id')
          .lean()
      ]);
      notesLinkedToHighlights.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));
      questionsLinkedToHighlights.forEach(row => addToCandidateSet(candidates.questionIds, row?._id));
    }

    const scopedWikiEdges = await Connection.find({
      userId,
      scopeType: 'article',
      scopeId: String(article._id),
      $or: [{ fromType: 'wiki_page' }, { toType: 'wiki_page' }]
    })
      .select('fromType fromId toType toId')
      .limit(300)
      .lean();
    scopedWikiEdges.forEach(edge => {
      if (edge?.fromType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.fromId);
      if (edge?.toType === 'wiki_page') addToCandidateSet(candidates.wikiPageIds, edge.toId);
    });
    return candidates;
  }

  return null;
};

const isConnectionItemInScopeCandidates = (itemType, itemId, candidates) => {
  if (!candidates) return true;
  const safeType = normalizeConnectionItemType(itemType);
  const safeId = String(itemId || '').trim();
  if (!safeType || !safeId) return false;
  if (safeType === 'highlight') return candidates.highlightIds.has(safeId);
  if (safeType === 'notebook') return candidates.notebookIds.has(safeId);
  if (safeType === 'article') return candidates.articleIds.has(safeId);
  if (safeType === 'concept') return candidates.conceptIds.has(safeId);
  if (safeType === 'question') return candidates.questionIds.has(safeId);
  if (safeType === 'wiki_page') return candidates.wikiPageIds.has(safeId);
  if (safeType === 'wiki_claim') return candidates.wikiClaimIds.has(safeId);
  return false;
};

const normalizeConceptPathItemType = (value) => normalizeConnectionItemType(value);

const normalizeConceptPathNotes = (value) => String(value || '').trim().slice(0, 400);

const sortPathItemRefs = (itemRefs = []) => (
  [...itemRefs]
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((item, index) => ({ ...item, order: index }))
);

const normalizePathItemRefsInput = (itemRefs = []) => {
  if (!Array.isArray(itemRefs)) return [];
  const normalized = [];
  itemRefs.forEach((item, index) => {
    const type = normalizeConceptPathItemType(item?.type);
    const id = String(item?.id || '').trim();
    if (!type || !id) return;
    normalized.push({
      type,
      id,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      notes: normalizeConceptPathNotes(item?.notes)
    });
  });
  return sortPathItemRefs(normalized);
};

const hydratePathItemRefs = async (userId, itemRefs = []) => {
  const sorted = sortPathItemRefs(itemRefs);
  const hydrated = await Promise.all(sorted.map(async (itemRef) => {
    const item = await resolveConnectionItem(userId, itemRef.type, itemRef.id);
    return {
      _id: itemRef._id,
      type: itemRef.type,
      id: itemRef.id,
      order: itemRef.order,
      notes: itemRef.notes || '',
      item
    };
  }));
  return hydrated.filter(row => row.item);
};

const ensureConceptPathOwnership = async (userId, pathId) => {
  if (!mongoose.Types.ObjectId.isValid(pathId)) return null;
  return ConceptPath.findOne({ _id: pathId, userId });
};

const getConceptPathWithProgress = async (userId, pathDoc) => {
  const path = pathDoc.toObject ? pathDoc.toObject() : pathDoc;
  const [itemRefs, progressDoc] = await Promise.all([
    hydratePathItemRefs(userId, path.itemRefs || []),
    ConceptPathProgress.findOne({ userId, pathId: path._id }).lean()
  ]);
  const progress = progressDoc || {
    understoodItemRefIds: [],
    currentIndex: 0
  };
  return {
    ...path,
    itemRefs,
    progress: {
      understoodItemRefIds: progress.understoodItemRefIds || [],
      currentIndex: Math.max(0, Math.min(progress.currentIndex || 0, Math.max(itemRefs.length - 1, 0)))
    }
  };
};

const parseCsvList = (value) => (
  String(value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
);

const buildGraphNodeKey = (itemType, itemId) => `${itemType}:${itemId}`;

const buildGraphNodeMap = async (userId, idsByType = {}) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const nodeMap = new Map();

  const highlightIds = toObjectIdList(Array.from(idsByType.highlight || []));
  if (highlightIds.length > 0) {
    const highlights = await Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights._id': { $in: highlightIds } } },
      { $project: {
        itemId: '$highlights._id',
        articleId: '$_id',
        articleTitle: '$title',
        text: '$highlights.text',
        tags: '$highlights.tags',
        createdAt: '$highlights.createdAt'
      } }
    ]);
    highlights.forEach(row => {
      const itemId = String(row.itemId);
      const key = buildGraphNodeKey('highlight', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'highlight',
        itemId,
        title: row.articleTitle || 'Highlight',
        snippet: buildQueueSnippet(row.text, row.articleTitle),
        tags: Array.isArray(row.tags) ? row.tags : [],
        updatedAt: row.createdAt || null,
        openPath: row.articleId ? `/library?articleId=${row.articleId}` : '/library?scope=highlights'
      });
    });
  }

  const notebookIds = toObjectIdList(Array.from(idsByType.notebook || []));
  if (notebookIds.length > 0) {
    const notes = await NotebookEntry.find({ userId, _id: { $in: notebookIds } })
      .select('title content tags updatedAt')
      .lean();
    notes.forEach(note => {
      const itemId = String(note._id);
      const key = buildGraphNodeKey('notebook', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'notebook',
        itemId,
        title: note.title || 'Note',
        snippet: buildQueueSnippet(note.content, note.title),
        tags: Array.isArray(note.tags) ? note.tags : [],
        updatedAt: note.updatedAt || null,
        openPath: `/think?tab=notebook&entryId=${note._id}`
      });
    });
  }

  const articleIds = toObjectIdList(Array.from(idsByType.article || []));
  if (articleIds.length > 0) {
    const articles = await Article.find({ userId, _id: { $in: articleIds } })
      .select('title content updatedAt')
      .lean();
    articles.forEach(article => {
      const itemId = String(article._id);
      const key = buildGraphNodeKey('article', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'article',
        itemId,
        title: article.title || 'Article',
        snippet: buildQueueSnippet(article.content, article.title),
        tags: [],
        updatedAt: article.updatedAt || null,
        openPath: `/library?articleId=${article._id}`
      });
    });
  }

  const conceptIds = toObjectIdList(Array.from(idsByType.concept || []));
  if (conceptIds.length > 0) {
    const concepts = await TagMeta.find({ userId, _id: { $in: conceptIds } })
      .select('name description updatedAt')
      .lean();
    concepts.forEach(concept => {
      const itemId = String(concept._id);
      const key = buildGraphNodeKey('concept', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'concept',
        itemId,
        title: concept.name || 'Concept',
        snippet: buildQueueSnippet(concept.description, concept.name),
        tags: concept.name ? [concept.name] : [],
        updatedAt: concept.updatedAt || null,
        openPath: concept.name ? `/think?tab=concepts&concept=${encodeURIComponent(concept.name)}` : '/think?tab=concepts'
      });
    });
  }

  const questionIds = toObjectIdList(Array.from(idsByType.question || []));
  if (questionIds.length > 0) {
    const questions = await Question.find({ userId, _id: { $in: questionIds } })
      .select('text linkedTagName updatedAt')
      .lean();
    questions.forEach(question => {
      const itemId = String(question._id);
      const key = buildGraphNodeKey('question', itemId);
      const tags = question.linkedTagName ? [question.linkedTagName] : [];
      nodeMap.set(key, {
        id: key,
        itemType: 'question',
        itemId,
        title: 'Question',
        snippet: buildQueueSnippet(question.text),
        tags,
        updatedAt: question.updatedAt || null,
        openPath: `/think?tab=questions&questionId=${question._id}`
      });
    });
  }

  const wikiPageIds = toObjectIdList(Array.from(idsByType.wiki_page || []));
  if (wikiPageIds.length > 0) {
    const pages = await WikiPage.find({ userId, _id: { $in: wikiPageIds }, status: { $ne: 'archived' } })
      .select('title plainText pageType status updatedAt')
      .lean();
    pages.forEach(page => {
      const itemId = String(page._id);
      const key = buildGraphNodeKey('wiki_page', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'wiki_page',
        itemId,
        title: page.title || 'Wiki page',
        snippet: buildQueueSnippet(page.plainText, page.pageType),
        tags: page.pageType ? [page.pageType] : [],
        updatedAt: page.updatedAt || null,
        openPath: `/wiki/${page._id}`
      });
    });
  }

  const wikiClaimRefs = Array.from(idsByType.wiki_claim || [])
    .map((value) => {
      const [pageId, ...claimParts] = String(value || '').split(':');
      const claimId = claimParts.join(':');
      return { raw: String(value || ''), pageId, claimId };
    })
    .filter(ref => mongoose.Types.ObjectId.isValid(ref.pageId) && ref.claimId);
  if (wikiClaimRefs.length > 0) {
    const claimPageIds = toObjectIdList([...new Set(wikiClaimRefs.map(ref => ref.pageId))]);
    const pages = await WikiPage.find({ userId, _id: { $in: claimPageIds }, status: { $ne: 'archived' } })
      .select('title claims updatedAt')
      .lean();
    const pageById = new Map(pages.map(page => [String(page._id), page]));
    wikiClaimRefs.forEach((ref) => {
      const page = pageById.get(ref.pageId);
      if (!page) return;
      const claim = (Array.isArray(page.claims) ? page.claims : [])
        .find(row => String(row?.claimId || '') === ref.claimId);
      if (!claim) return;
      const key = buildGraphNodeKey('wiki_claim', ref.raw);
      const support = String(claim.support || '').trim();
      nodeMap.set(key, {
        id: key,
        itemType: 'wiki_claim',
        itemId: ref.raw,
        title: claim.section || 'Wiki claim',
        snippet: buildQueueSnippet(claim.text, page.title),
        tags: ['claim', support].filter(Boolean),
        updatedAt: claim.lastReviewedAt || page.updatedAt || null,
        openPath: `/wiki/${page._id}`
      });
    });
  }

  return nodeMap;
};

module.exports = {
  normalizeReturnQueueItemType,
  parseDueAt,
  buildUnavailableQueueItem,
  buildQueueSnippet,
  escapeRegExp,
  resolveConceptByParam,
  resolveReturnQueueItem,
  normalizeConnectionItemType,
  normalizeRelationType,
  resolveConnectionItem,
  resolveConnectionScopeInput,
  toObjectIdList,
  addToCandidateSet,
  buildConnectionScopeCandidates,
  isConnectionItemInScopeCandidates,
  normalizeConceptPathItemType,
  normalizeConceptPathNotes,
  sortPathItemRefs,
  normalizePathItemRefsInput,
  ensureConceptPathOwnership,
  getConceptPathWithProgress,
  parseCsvList,
  buildGraphNodeKey,
  buildGraphNodeMap
};
