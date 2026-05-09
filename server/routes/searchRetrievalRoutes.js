const express = require('express');

const SEARCH_SCOPE_VALUES = new Set(['all', 'articles', 'highlights', 'notebook']);
const SEARCH_TYPE_VALUES = new Set(['article', 'highlight', 'notebook', 'note', 'claim', 'evidence']);
const SEARCH_ENTRY_TYPE_VALUES = new Set(['note', 'claim', 'evidence']);
const RELATED_REASON_SCORES = Object.freeze({
  connection: 5,
  tag: 3,
  coview: 2
});

const buildSearchRetrievalRouter = ({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry,
  ItemViewEvent,
  Connection,
  TagMeta,
  Question,
  normalizeConnectionItemType,
  resolveConnectionItem,
  escapeRegExp,
  parseCsvList,
  buildQueueSnippet,
  buildGraphNodeMap,
  buildGraphNodeKey,
  addToCandidateSet,
  findHighlightById,
  normalizeItemType
}) => {
  const router = express.Router();

  const normalizeSearchScope = (value) => {
    const candidate = String(value || 'all').trim().toLowerCase();
    if (SEARCH_SCOPE_VALUES.has(candidate)) return candidate;
    return 'all';
  };

  const normalizeSearchTypeFilters = (value) => (
    parseCsvList(value)
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => SEARCH_TYPE_VALUES.has(item))
  );

  const normalizeSearchTagFilters = (value) => (
    parseCsvList(value)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 10)
  );

  const normalizeEntryTypeFilters = (types = []) => {
    const entryTypes = types.filter(type => SEARCH_ENTRY_TYPE_VALUES.has(type));
    return Array.from(new Set(entryTypes));
  };

  const hasRequestedType = (typeSet, candidates = []) => (
    typeSet.size === 0 || candidates.some(candidate => typeSet.has(candidate))
  );

  const toCaseInsensitiveTagRegexes = (tags = []) => (
    tags
      .map(tag => String(tag || '').trim())
      .filter(Boolean)
      .map(tag => new RegExp(`^${escapeRegExp(tag)}$`, 'i'))
  );

  const toSafeObjectId = (value) => (
    mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null
  );

  const resolveNotebookSnippet = (entry) => {
    const blockText = Array.isArray(entry?.blocks)
      ? (entry.blocks.find(block => String(block?.text || '').trim())?.text || '')
      : '';
    return buildQueueSnippet(entry?.content || '', blockText, entry?.title || '');
  };

  const normalizeRelatedLimit = (value, fallback = 8) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.round(parsed), 1), 20);
  };

  const buildRelatedKey = (itemType, itemId) => `${itemType}:${itemId}`;

  const scoreRelatedCandidate = (candidateMap, itemType, itemId, reason, score = 1) => {
    const safeType = normalizeConnectionItemType(itemType);
    const safeId = String(itemId || '').trim();
    if (!safeType || !safeId) return;
    const key = buildRelatedKey(safeType, safeId);
    const existing = candidateMap.get(key);
    const reasonScore = Number(score) || 0;
    if (!existing) {
      candidateMap.set(key, {
        itemType: safeType,
        itemId: safeId,
        score: reasonScore,
        reasons: new Set([reason])
      });
      return;
    }
    existing.score += reasonScore;
    existing.reasons.add(reason);
  };

  const normalizeTagValues = (tags = []) => {
    const set = new Set();
    (Array.isArray(tags) ? tags : []).forEach(tag => {
      const value = String(tag || '').trim();
      if (!value) return;
      set.add(value.toLowerCase());
    });
    return Array.from(set);
  };

  const computeTagOverlapScore = (sourceTagSet, targetTags = []) => {
    if (!sourceTagSet.size) return 0;
    const overlap = normalizeTagValues(targetTags).reduce((count, tag) => (
      sourceTagSet.has(tag) ? count + 1 : count
    ), 0);
    return overlap;
  };

  const resolveItemTagSignals = async (userId, itemType, itemId) => {
    const safeType = normalizeConnectionItemType(itemType);
    const safeId = String(itemId || '').trim();
    if (!safeType || !safeId) return [];

    if (safeType === 'highlight') {
      const highlight = await findHighlightById(userId, safeId);
      return normalizeTagValues(highlight?.tags || []);
    }
    if (safeType === 'notebook') {
      if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
      const note = await NotebookEntry.findOne({ _id: safeId, userId })
        .select('tags')
        .lean();
      return normalizeTagValues(note?.tags || []);
    }
    if (safeType === 'concept') {
      if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
      const concept = await TagMeta.findOne({ _id: safeId, userId })
        .select('name')
        .lean();
      return concept?.name ? normalizeTagValues([concept.name]) : [];
    }
    if (safeType === 'question') {
      if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
      const question = await Question.findOne({ _id: safeId, userId })
        .select('linkedTagName conceptName')
        .lean();
      return normalizeTagValues([question?.linkedTagName, question?.conceptName]);
    }
    if (safeType === 'article') {
      if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
      const article = await Article.findOne({ _id: safeId, userId })
        .select('highlights.tags')
        .lean();
      const tags = [];
      (article?.highlights || []).forEach(highlight => {
        (highlight?.tags || []).forEach(tag => tags.push(tag));
      });
      return normalizeTagValues(tags).slice(0, 20);
    }
    return [];
  };

  const collectTagRelatedCandidates = async (userId, sourceType, sourceId, sourceTags = [], candidateMap) => {
    if (!sourceTags.length) return;
    const sourceTagSet = new Set(sourceTags);
    const tagRegexes = toCaseInsensitiveTagRegexes(sourceTags);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [highlightRows, notebookRows, conceptRows, questionRows, articleRows] = await Promise.all([
      Article.aggregate([
        { $match: { userId: userObjectId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': { $in: tagRegexes } } },
        {
          $project: {
            _id: '$highlights._id',
            tags: '$highlights.tags'
          }
        },
        { $sort: { 'highlights.createdAt': -1 } },
        { $limit: 120 }
      ]),
      NotebookEntry.find({ userId, tags: { $in: tagRegexes } })
        .select('_id tags updatedAt')
        .sort({ updatedAt: -1 })
        .limit(120)
        .lean(),
      TagMeta.find({ userId, name: { $in: tagRegexes } })
        .select('_id name updatedAt')
        .sort({ updatedAt: -1 })
        .limit(30)
        .lean(),
      Question.find({
        userId,
        $or: [{ linkedTagName: { $in: tagRegexes } }, { conceptName: { $in: tagRegexes } }]
      })
        .select('_id linkedTagName conceptName updatedAt')
        .sort({ updatedAt: -1 })
        .limit(60)
        .lean(),
      Article.find({ userId, 'highlights.tags': { $in: tagRegexes } })
        .select('_id highlights.tags updatedAt')
        .sort({ updatedAt: -1 })
        .limit(60)
        .lean()
    ]);

    highlightRows.forEach(row => {
      const itemId = String(row?._id || '');
      if (sourceType === 'highlight' && itemId === sourceId) return;
      const overlap = computeTagOverlapScore(sourceTagSet, row?.tags || []);
      scoreRelatedCandidate(
        candidateMap,
        'highlight',
        itemId,
        'tag',
        RELATED_REASON_SCORES.tag + overlap
      );
    });

    notebookRows.forEach(row => {
      const itemId = String(row?._id || '');
      if (sourceType === 'notebook' && itemId === sourceId) return;
      const overlap = computeTagOverlapScore(sourceTagSet, row?.tags || []);
      scoreRelatedCandidate(
        candidateMap,
        'notebook',
        itemId,
        'tag',
        RELATED_REASON_SCORES.tag + overlap
      );
    });

    conceptRows.forEach(row => {
      const itemId = String(row?._id || '');
      if (sourceType === 'concept' && itemId === sourceId) return;
      scoreRelatedCandidate(candidateMap, 'concept', itemId, 'tag', RELATED_REASON_SCORES.tag + 1);
    });

    questionRows.forEach(row => {
      const itemId = String(row?._id || '');
      if (sourceType === 'question' && itemId === sourceId) return;
      const overlap = computeTagOverlapScore(sourceTagSet, [row?.linkedTagName, row?.conceptName]);
      scoreRelatedCandidate(
        candidateMap,
        'question',
        itemId,
        'tag',
        RELATED_REASON_SCORES.tag + overlap
      );
    });

    articleRows.forEach(row => {
      const itemId = String(row?._id || '');
      if (sourceType === 'article' && itemId === sourceId) return;
      const articleTags = [];
      (row?.highlights || []).forEach(highlight => {
        (highlight?.tags || []).forEach(tag => articleTags.push(tag));
      });
      const overlap = computeTagOverlapScore(sourceTagSet, articleTags);
      scoreRelatedCandidate(
        candidateMap,
        'article',
        itemId,
        'tag',
        RELATED_REASON_SCORES.tag + overlap
      );
    });
  };

  const collectConnectionRelatedCandidates = async (userId, sourceType, sourceId, candidateMap) => {
    const connections = await Connection.find({
      userId,
      $or: [
        { fromType: sourceType, fromId: sourceId },
        { toType: sourceType, toId: sourceId }
      ]
    })
      .select('fromType fromId toType toId relationType')
      .sort({ createdAt: -1 })
      .limit(160)
      .lean();

    connections.forEach(connection => {
      const pointsFromSource = connection.fromType === sourceType && connection.fromId === sourceId;
      const itemType = pointsFromSource ? connection.toType : connection.fromType;
      const itemId = pointsFromSource ? connection.toId : connection.fromId;
      if (!itemType || !itemId) return;
      scoreRelatedCandidate(
        candidateMap,
        itemType,
        itemId,
        'connection',
        RELATED_REASON_SCORES.connection
      );
    });
  };

  const collectCoViewCandidates = async (userId, sourceType, sourceId, candidateMap) => {
    const lookbackStart = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const rows = await ItemViewEvent.find({
      userId,
      createdAt: { $gte: lookbackStart },
      $or: [
        { itemType: sourceType, itemId: sourceId, previousItemType: { $ne: '' }, previousItemId: { $ne: '' } },
        { previousItemType: sourceType, previousItemId: sourceId }
      ]
    })
      .select('itemType itemId previousItemType previousItemId')
      .sort({ createdAt: -1 })
      .limit(260)
      .lean();

    rows.forEach(row => {
      const sourceIsCurrent = row.itemType === sourceType && row.itemId === sourceId;
      const candidateType = sourceIsCurrent ? row.previousItemType : row.itemType;
      const candidateId = sourceIsCurrent ? row.previousItemId : row.itemId;
      scoreRelatedCandidate(candidateMap, candidateType, candidateId, 'coview', RELATED_REASON_SCORES.coview);
    });
  };

  const hydrateRelatedCandidates = async (userId, candidateMap, limit = 8) => {
    const idsByType = {
      highlight: new Set(),
      notebook: new Set(),
      article: new Set(),
      concept: new Set(),
      question: new Set(),
      wiki_page: new Set(),
      wiki_claim: new Set()
    };
    candidateMap.forEach(candidate => {
      addToCandidateSet(idsByType[candidate.itemType], candidate.itemId);
    });
    const nodeMap = await buildGraphNodeMap(userId, idsByType);

    const hydrated = [];
    candidateMap.forEach((candidate, key) => {
      const nodeKey = buildGraphNodeKey(candidate.itemType, candidate.itemId);
      const node = nodeMap.get(nodeKey);
      if (!node) return;
      hydrated.push({
        id: key,
        itemType: candidate.itemType,
        itemId: candidate.itemId,
        title: node.title || 'Untitled',
        snippet: node.snippet || '',
        tags: Array.isArray(node.tags) ? node.tags : [],
        updatedAt: node.updatedAt || null,
        openPath: node.openPath || '',
        score: candidate.score,
        reasons: Array.from(candidate.reasons)
      });
    });

    return hydrated
      .sort((a, b) => (
        (b.score - a.score) ||
        (new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      ))
      .slice(0, limit);
  };

  router.get('/api/search', authenticateToken, async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q) {
        return res.status(400).json({ error: 'Query parameter q is required.' });
      }
      const userId = req.user.id;
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const scope = normalizeSearchScope(req.query.scope);
      const requestedTypes = new Set(normalizeSearchTypeFilters(req.query.type));
      const entryTypeFilters = normalizeEntryTypeFilters(Array.from(requestedTypes));
      const tagFilters = normalizeSearchTagFilters(req.query.tags);
      const tagRegexes = toCaseInsensitiveTagRegexes(tagFilters);
      const notebookId = String(req.query.notebookId || req.query.notebook || '').trim();
      const notebookObjectId = toSafeObjectId(notebookId);
      const queryRegex = new RegExp(escapeRegExp(q), 'i');

      const includeArticles = (scope === 'all' || scope === 'articles')
        && hasRequestedType(requestedTypes, ['article']);
      const includeHighlights = (scope === 'all' || scope === 'highlights')
        && hasRequestedType(requestedTypes, ['highlight', 'note', 'claim', 'evidence']);
      const includeNotebook = (scope === 'all' || scope === 'notebook')
        && hasRequestedType(requestedTypes, ['notebook', 'note', 'claim', 'evidence']);

      const highlightTypeFilters = entryTypeFilters.length > 0 ? entryTypeFilters : [];
      const notebookTypeFilters = entryTypeFilters.length > 0 ? entryTypeFilters : [];

      const [articleRows, highlightRows, notebookRows] = await Promise.all([
        includeArticles
          ? Article.aggregate([
              { $match: { userId: userObjectId, $text: { $search: q } } },
              ...(tagRegexes.length > 0 ? [{ $match: { 'highlights.tags': { $in: tagRegexes } } }] : []),
              { $addFields: { _score: { $meta: 'textScore' } } },
              { $sort: { _score: -1, updatedAt: -1 } },
              { $limit: 40 },
              { $project: { title: 1, content: 1, url: 1, updatedAt: 1, _score: 1 } }
            ])
          : Promise.resolve([]),
        includeHighlights
          ? Article.aggregate([
              { $match: { userId: userObjectId, $text: { $search: q } } },
              ...(tagRegexes.length > 0 ? [{ $match: { 'highlights.tags': { $in: tagRegexes } } }] : []),
              { $addFields: { _score: { $meta: 'textScore' } } },
              { $project: { title: 1, highlights: 1, _score: 1 } },
              { $unwind: '$highlights' },
              ...(tagRegexes.length > 0 ? [{ $match: { 'highlights.tags': { $in: tagRegexes } } }] : []),
              ...(highlightTypeFilters.length > 0 ? [{ $match: { 'highlights.type': { $in: highlightTypeFilters } } }] : []),
              {
                $match: {
                  $or: [
                    { 'highlights.text': queryRegex },
                    { 'highlights.note': queryRegex },
                    { 'highlights.tags': queryRegex },
                    { title: queryRegex }
                  ]
                }
              },
              {
                $project: {
                  _id: '$highlights._id',
                  articleId: '$_id',
                  articleTitle: '$title',
                  text: '$highlights.text',
                  note: '$highlights.note',
                  tags: '$highlights.tags',
                  type: { $ifNull: ['$highlights.type', 'note'] },
                  claimId: '$highlights.claimId',
                  createdAt: '$highlights.createdAt',
                  _score: 1
                }
              },
              { $sort: { _score: -1, createdAt: -1 } },
              { $limit: 120 }
            ])
          : Promise.resolve([]),
        includeNotebook
          ? NotebookEntry.aggregate([
              {
                $match: {
                  userId: userObjectId,
                  $text: { $search: q },
                  ...(notebookId ? { _id: notebookObjectId || new mongoose.Types.ObjectId() } : {})
                }
              },
              ...(tagRegexes.length > 0 ? [{ $match: { tags: { $in: tagRegexes } } }] : []),
              { $addFields: { _score: { $meta: 'textScore' } } },
              ...(notebookTypeFilters.length > 0 ? [{ $match: { type: { $in: notebookTypeFilters } } }] : []),
              { $sort: { _score: -1, updatedAt: -1 } },
              { $limit: 80 },
              { $project: { title: 1, content: 1, blocks: 1, tags: 1, type: 1, updatedAt: 1, _score: 1 } }
            ])
          : Promise.resolve([])
      ]);

      let articles = (articleRows || []).map(row => ({
        _id: row._id,
        title: row.title || 'Untitled article',
        content: buildQueueSnippet(row.content || '', row.title || ''),
        url: row.url || '',
        updatedAt: row.updatedAt || null,
        score: row._score || 0
      }));

      let highlights = (highlightRows || []).map(row => ({
        _id: row._id,
        articleId: row.articleId,
        articleTitle: row.articleTitle || 'Untitled article',
        text: row.text || '',
        note: row.note || '',
        tags: Array.isArray(row.tags) ? row.tags : [],
        type: normalizeItemType(row.type, 'note'),
        claimId: row.claimId || null,
        createdAt: row.createdAt || null,
        score: row._score || 0
      }));

      let notebook = (notebookRows || []).map(entry => ({
        _id: entry._id,
        title: entry.title || 'Untitled note',
        content: resolveNotebookSnippet(entry),
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        type: normalizeItemType(entry.type, 'note'),
        updatedAt: entry.updatedAt || null,
        score: entry._score || 0
      }));

      if (articles.length === 0 && includeArticles) {
        const articleFallback = await Article.find({
          userId,
          $or: [{ title: queryRegex }, { content: queryRegex }]
        })
          .select('title content url updatedAt')
          .sort({ updatedAt: -1 })
          .limit(20)
          .lean();
        articles = articleFallback.map(row => ({
          _id: row._id,
          title: row.title || 'Untitled article',
          content: buildQueueSnippet(row.content || '', row.title || ''),
          url: row.url || '',
          updatedAt: row.updatedAt || null,
          score: 0
        }));
      }

      if (highlights.length === 0 && includeHighlights) {
        const highlightFallback = await Article.aggregate([
          { $match: { userId: userObjectId } },
          { $unwind: '$highlights' },
          ...(tagRegexes.length > 0 ? [{ $match: { 'highlights.tags': { $in: tagRegexes } } }] : []),
          ...(highlightTypeFilters.length > 0 ? [{ $match: { 'highlights.type': { $in: highlightTypeFilters } } }] : []),
          {
            $match: {
              $or: [
                { 'highlights.text': queryRegex },
                { 'highlights.note': queryRegex },
                { 'highlights.tags': queryRegex },
                { title: queryRegex }
              ]
            }
          },
          {
            $project: {
              _id: '$highlights._id',
              articleId: '$_id',
              articleTitle: '$title',
              text: '$highlights.text',
              note: '$highlights.note',
              tags: '$highlights.tags',
              type: { $ifNull: ['$highlights.type', 'note'] },
              claimId: '$highlights.claimId',
              createdAt: '$highlights.createdAt'
            }
          },
          { $sort: { createdAt: -1 } },
          { $limit: 80 }
        ]);
        highlights = highlightFallback.map(row => ({
          _id: row._id,
          articleId: row.articleId,
          articleTitle: row.articleTitle || 'Untitled article',
          text: row.text || '',
          note: row.note || '',
          tags: Array.isArray(row.tags) ? row.tags : [],
          type: normalizeItemType(row.type, 'note'),
          claimId: row.claimId || null,
          createdAt: row.createdAt || null,
          score: 0
        }));
      }

      if (notebook.length === 0 && includeNotebook) {
        const notebookFallback = await NotebookEntry.find({
          userId,
          ...(notebookId ? { _id: notebookObjectId || new mongoose.Types.ObjectId() } : {}),
          ...(notebookTypeFilters.length > 0 ? { type: { $in: notebookTypeFilters } } : {}),
          ...(tagRegexes.length > 0 ? { tags: { $in: tagRegexes } } : {}),
          $or: [
            { title: queryRegex },
            { content: queryRegex },
            { 'blocks.text': queryRegex },
            { tags: queryRegex }
          ]
        })
          .select('title content blocks tags type updatedAt')
          .sort({ updatedAt: -1 })
          .limit(50)
          .lean();
        notebook = notebookFallback.map(entry => ({
          _id: entry._id,
          title: entry.title || 'Untitled note',
          content: resolveNotebookSnippet(entry),
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          type: normalizeItemType(entry.type, 'note'),
          updatedAt: entry.updatedAt || null,
          score: 0
        }));
      }

      const notes = [
        ...notebook.filter(item => item.type === 'note').map(item => ({
          ...item,
          sourceType: 'notebook',
          openPath: `/think?tab=notebook&entryId=${item._id}`
        }))
      ];

      const claimResults = [
        ...highlights.filter(item => item.type === 'claim').map(item => ({
          ...item,
          sourceType: 'highlight',
          openPath: `/library?articleId=${item.articleId}`
        })),
        ...notebook.filter(item => item.type === 'claim').map(item => ({
          ...item,
          sourceType: 'notebook',
          openPath: `/think?tab=notebook&entryId=${item._id}`
        }))
      ].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));

      const evidenceResults = [
        ...highlights.filter(item => item.type === 'evidence').map(item => ({
          ...item,
          sourceType: 'highlight',
          openPath: `/library?articleId=${item.articleId}`
        })),
        ...notebook.filter(item => item.type === 'evidence').map(item => ({
          ...item,
          sourceType: 'notebook',
          openPath: `/think?tab=notebook&entryId=${item._id}`
        }))
      ].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));

      const highlightGroup = highlights
        .filter(item => item.type === 'note')
        .map(item => ({
          ...item,
          sourceType: 'highlight',
          openPath: `/library?articleId=${item.articleId}`
        }));

      res.status(200).json({
        query: q,
        filters: {
          scope,
          tags: tagFilters,
          type: Array.from(requestedTypes),
          notebookId: notebookObjectId ? String(notebookObjectId) : ''
        },
        articles,
        highlights,
        notebook,
        groups: {
          notes: notes.slice(0, 40),
          highlights: highlightGroup.slice(0, 40),
          claims: claimResults.slice(0, 40),
          evidence: evidenceResults.slice(0, 40)
        }
      });
    } catch (error) {
      console.error('❌ Error performing search:', error);
      res.status(500).json({ error: 'Failed to perform search.' });
    }
  });

  router.post('/api/retrieval/view', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const itemType = normalizeConnectionItemType(req.body?.itemType);
      const itemId = String(req.body?.itemId || '').trim();
      if (!itemType || !itemId) {
        return res.status(400).json({ error: 'itemType and itemId are required.' });
      }

      const currentItem = await resolveConnectionItem(userId, itemType, itemId);
      if (!currentItem) {
        return res.status(404).json({ error: 'Item not found for this user.' });
      }

      const previousItemType = normalizeConnectionItemType(req.body?.previousItemType);
      const previousItemId = String(req.body?.previousItemId || '').trim();
      let safePreviousType = '';
      let safePreviousId = '';
      if (previousItemType && previousItemId && !(previousItemType === itemType && previousItemId === itemId)) {
        const previousItem = await resolveConnectionItem(userId, previousItemType, previousItemId);
        if (previousItem) {
          safePreviousType = previousItemType;
          safePreviousId = previousItemId;
        }
      }

      await ItemViewEvent.create({
        itemType,
        itemId,
        previousItemType: safePreviousType,
        previousItemId: safePreviousId,
        userId
      });

      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('❌ Error recording retrieval view:', error);
      res.status(500).json({ error: 'Failed to record item view.' });
    }
  });

  router.get('/api/retrieval/related', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const itemType = normalizeConnectionItemType(req.query.itemType);
      const itemId = String(req.query.itemId || '').trim();
      const limit = normalizeRelatedLimit(req.query.limit, 8);
      if (!itemType || !itemId) {
        return res.status(400).json({ error: 'itemType and itemId are required.' });
      }

      const item = await resolveConnectionItem(userId, itemType, itemId);
      if (!item) {
        return res.status(404).json({ error: 'Item not found for this user.' });
      }

      const candidateMap = new Map();
      const sourceTags = await resolveItemTagSignals(userId, itemType, itemId);
      await Promise.all([
        collectConnectionRelatedCandidates(userId, itemType, itemId, candidateMap),
        collectTagRelatedCandidates(userId, itemType, itemId, sourceTags, candidateMap),
        collectCoViewCandidates(userId, itemType, itemId, candidateMap)
      ]);
      candidateMap.delete(buildRelatedKey(itemType, itemId));
      const items = await hydrateRelatedCandidates(userId, candidateMap, limit);

      res.status(200).json({
        itemType,
        itemId,
        tags: sourceTags,
        items
      });
    } catch (error) {
      console.error('❌ Error fetching retrieval related items:', error);
      res.status(500).json({ error: 'Failed to fetch related items.' });
    }
  });

  return router;
};

module.exports = {
  buildSearchRetrievalRouter
};
