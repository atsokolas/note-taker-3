const express = require('express');

const INVERSE_CONNECTION_RELATION_TYPES = {
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

const buildConnectionsRouter = ({
  mongoose,
  authenticateToken,
  Connection,
  NotebookEntry,
  Article,
  TagMeta,
  Question,
  WikiPage,
  normalizeConnectionItemType,
  normalizeRelationType,
  resolveConnectionScopeInput,
  resolveConnectionItem,
  buildConnectionScopeQuery,
  buildConnectionScopeCandidates,
  toObjectIdList,
  escapeRegExp,
  buildQueueSnippet,
  isConnectionItemInScopeCandidates,
  parseCsvList,
  buildGraphNodeMap,
  buildGraphNodeKey,
  addToCandidateSet
}) => {
  const router = express.Router();

  router.post('/api/connections', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        fromType = '',
        fromId = '',
        toType = '',
        toId = '',
        relationType = '',
        scopeType,
        scopeId
      } = req.body || {};

      const safeFromType = normalizeConnectionItemType(fromType);
      const safeToType = normalizeConnectionItemType(toType);
      const safeFromId = String(fromId || '').trim();
      const safeToId = String(toId || '').trim();
      const safeRelationType = normalizeRelationType(relationType);

      if (!safeFromType || !safeToType || !safeFromId || !safeToId || !safeRelationType) {
        return res.status(400).json({
          error: 'fromType, fromId, toType, toId, relationType are required.'
        });
      }
      if (safeFromType === safeToType && safeFromId === safeToId) {
        return res.status(400).json({ error: 'Cannot connect an item to itself.' });
      }

      const hasScopeInput = scopeType !== undefined || scopeId !== undefined;
      const scope = await resolveConnectionScopeInput(userId, scopeType, scopeId, hasScopeInput);
      if (!scope) {
        return res.status(400).json({ error: 'Invalid scopeType/scopeId.' });
      }

      const [fromItem, toItem] = await Promise.all([
        resolveConnectionItem(userId, safeFromType, safeFromId),
        resolveConnectionItem(userId, safeToType, safeToId)
      ]);
      if (!fromItem || !toItem) {
        return res.status(404).json({ error: 'One or both items were not found for this user.' });
      }

      const reciprocalRelationType = INVERSE_CONNECTION_RELATION_TYPES[safeRelationType] || 'referenced_by';
      const connectionQuery = {
        userId,
        fromType: safeFromType,
        fromId: safeFromId,
        toType: safeToType,
        toId: safeToId,
        relationType: safeRelationType,
        ...buildConnectionScopeQuery(scope)
      };
      const reciprocalQuery = {
        userId,
        fromType: safeToType,
        fromId: safeToId,
        toType: safeFromType,
        toId: safeFromId,
        relationType: reciprocalRelationType,
        ...buildConnectionScopeQuery(scope)
      };

      const existing = await Connection.findOne(connectionQuery).lean();
      if (existing) {
        let reciprocalConnection = await Connection.findOne(reciprocalQuery).lean();
        let reciprocalCreated = false;
        if (!reciprocalConnection) {
          try {
            const repaired = await Connection.create({
              fromType: safeToType,
              fromId: safeToId,
              toType: safeFromType,
              toId: safeFromId,
              relationType: reciprocalRelationType,
              scopeType: scope.scopeType || '',
              scopeId: scope.scopeId || '',
              userId
            });
            reciprocalConnection = repaired.toObject ? repaired.toObject() : repaired;
            reciprocalCreated = true;
          } catch (reciprocalError) {
            if (reciprocalError?.code !== 11000) throw reciprocalError;
            reciprocalConnection = await Connection.findOne(reciprocalQuery).lean();
          }
        }
        return res.status(200).json({
          ...existing,
          fromItem,
          toItem,
          existing: true,
          reciprocalConnection,
          trace: {
            bidirectional: Boolean(reciprocalConnection),
            forwardId: String(existing._id || ''),
            reciprocalId: String(reciprocalConnection?._id || ''),
            reciprocalCreated,
            relationType: safeRelationType,
            reciprocalRelationType
          }
        });
      }

      const created = await Connection.create({
        fromType: safeFromType,
        fromId: safeFromId,
        toType: safeToType,
        toId: safeToId,
        relationType: safeRelationType,
        scopeType: scope.scopeType || '',
        scopeId: scope.scopeId || '',
        userId
      });
      const createdObject = created.toObject ? created.toObject() : created;

      let reciprocalConnection = null;
      let reciprocalCreated = false;
      try {
        const reciprocal = await Connection.create({
          fromType: safeToType,
          fromId: safeToId,
          toType: safeFromType,
          toId: safeFromId,
          relationType: reciprocalRelationType,
          scopeType: scope.scopeType || '',
          scopeId: scope.scopeId || '',
          userId
        });
        reciprocalConnection = reciprocal.toObject ? reciprocal.toObject() : reciprocal;
        reciprocalCreated = true;
      } catch (reciprocalError) {
        if (reciprocalError?.code !== 11000) throw reciprocalError;
        reciprocalConnection = await Connection.findOne(reciprocalQuery).lean();
      }

      res.status(201).json({
        ...createdObject,
        fromItem,
        toItem,
        reciprocalConnection,
        trace: {
          bidirectional: Boolean(reciprocalConnection),
          forwardId: String(createdObject._id || ''),
          reciprocalId: String(reciprocalConnection?._id || ''),
          reciprocalCreated,
          relationType: safeRelationType,
          reciprocalRelationType
        }
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'Connection already exists.' });
      }
      console.error('❌ Error creating connection:', error);
      res.status(500).json({ error: 'Failed to create connection.' });
    }
  });

  router.get('/api/connections', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const safeItemType = normalizeConnectionItemType(req.query.itemType);
      const safeItemId = String(req.query.itemId || '').trim();
      if (!safeItemType || !safeItemId) {
        return res.status(400).json({ error: 'itemType and itemId are required.' });
      }

      const item = await resolveConnectionItem(userId, safeItemType, safeItemId);
      if (!item) {
        return res.status(404).json({ error: 'Item not found for this user.' });
      }

      const hasScopeInput = req.query.scopeType !== undefined || req.query.scopeId !== undefined;
      const scope = await resolveConnectionScopeInput(userId, req.query.scopeType, req.query.scopeId, hasScopeInput);
      if (!scope) {
        return res.status(400).json({ error: 'Invalid scopeType/scopeId.' });
      }

      const scopeFilter = buildConnectionScopeQuery(scope);

      const [outgoingRows, incomingRows] = await Promise.all([
        Connection.find({ userId, fromType: safeItemType, fromId: safeItemId, ...scopeFilter })
          .sort({ createdAt: -1 })
          .lean(),
        Connection.find({ userId, toType: safeItemType, toId: safeItemId, ...scopeFilter })
          .sort({ createdAt: -1 })
          .lean()
      ]);

      const outgoing = await Promise.all(outgoingRows.map(async (row) => ({
        ...row,
        target: await resolveConnectionItem(userId, row.toType, row.toId)
      })));
      const incoming = await Promise.all(incomingRows.map(async (row) => ({
        ...row,
        source: await resolveConnectionItem(userId, row.fromType, row.fromId)
      })));

      res.status(200).json({
        item,
        scope: {
          scopeType: scope.scopeType || '',
          scopeId: scope.scopeId || ''
        },
        outgoing: outgoing.filter(row => row.target),
        incoming: incoming.filter(row => row.source)
      });
    } catch (error) {
      console.error('❌ Error listing connections:', error);
      res.status(500).json({ error: 'Failed to list connections.' });
    }
  });

  router.get('/api/connections/search', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const q = String(req.query.q || '').trim();
      const excludeType = normalizeConnectionItemType(req.query.excludeType);
      const excludeId = String(req.query.excludeId || '').trim();
      const limit = Math.max(1, Math.min(40, Number(req.query.limit) || 15));
      const regex = q ? new RegExp(escapeRegExp(q), 'i') : null;
      const requestedItemTypes = String(req.query.itemTypes || '')
        .split(',')
        .map(value => normalizeConnectionItemType(value))
        .filter(Boolean);
      const allowedItemTypes = new Set(requestedItemTypes);
      const hasScopeInput = req.query.scopeType !== undefined || req.query.scopeId !== undefined;
      const scope = await resolveConnectionScopeInput(userId, req.query.scopeType, req.query.scopeId, hasScopeInput);
      if (!scope) {
        return res.status(400).json({ error: 'Invalid scopeType/scopeId.' });
      }
      const scopeCandidates = await buildConnectionScopeCandidates(userId, scope);
      const scopedNotebookObjectIds = scopeCandidates
        ? toObjectIdList(Array.from(scopeCandidates.notebookIds || []))
        : [];
      const scopedHighlightObjectIds = scopeCandidates
        ? toObjectIdList(Array.from(scopeCandidates.highlightIds || []))
        : [];
      const scopedArticleObjectIds = scopeCandidates
        ? toObjectIdList(Array.from(scopeCandidates.articleIds || []))
        : [];
      const scopedConceptObjectIds = scopeCandidates
        ? toObjectIdList(Array.from(scopeCandidates.conceptIds || []))
        : [];
      const scopedQuestionObjectIds = scopeCandidates
        ? toObjectIdList(Array.from(scopeCandidates.questionIds || []))
        : [];
      const scopedWikiPageObjectIds = scopeCandidates
        ? toObjectIdList(Array.from(scopeCandidates.wikiPageIds || []))
        : [];

      if (
        scopeCandidates &&
        scopedNotebookObjectIds.length === 0 &&
        scopedHighlightObjectIds.length === 0 &&
        scopedArticleObjectIds.length === 0 &&
        scopedConceptObjectIds.length === 0 &&
        scopedQuestionObjectIds.length === 0 &&
        scopedWikiPageObjectIds.length === 0
      ) {
        return res.status(200).json([]);
      }

      const fetchLimit = scopeCandidates ? Math.max(limit * 4, 80) : limit;
      const notebookQuery = {
        userId,
        ...(regex ? { $or: [{ title: regex }, { content: regex }] } : {})
      };
      if (scopeCandidates) {
        notebookQuery._id = { $in: scopedNotebookObjectIds };
      }

      const articleQuery = {
        userId,
        ...(regex ? { $or: [{ title: regex }, { content: regex }, { url: regex }] } : {})
      };
      if (scopeCandidates) {
        articleQuery._id = { $in: scopedArticleObjectIds };
      }

      const conceptQuery = {
        userId,
        ...(regex ? { $or: [{ name: regex }, { description: regex }] } : {})
      };
      if (scopeCandidates) {
        conceptQuery._id = { $in: scopedConceptObjectIds };
      }

      const questionQuery = {
        userId,
        ...(regex ? { text: regex } : {})
      };
      if (scopeCandidates) {
        questionQuery._id = { $in: scopedQuestionObjectIds };
      }

      const wikiPageQuery = {
        userId,
        status: { $ne: 'archived' },
        ...(regex ? { $or: [{ title: regex }, { plainText: regex }, { pageType: regex }] } : {})
      };
      if (scopeCandidates) {
        wikiPageQuery._id = { $in: scopedWikiPageObjectIds };
      }

      const [notebooks, highlights, articles, concepts, questions, wikiPages] = await Promise.all([
        NotebookEntry.find(notebookQuery)
          .select('title content updatedAt')
          .sort({ updatedAt: -1 })
          .limit(fetchLimit)
          .lean(),
        Article.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(userId) } },
          { $unwind: '$highlights' },
          ...(scopeCandidates ? [{ $match: { 'highlights._id': { $in: scopedHighlightObjectIds } } }] : []),
          ...(regex ? [{
            $match: {
              $or: [
                { title: regex },
                { 'highlights.text': regex },
                { 'highlights.note': regex }
              ]
            }
          }] : []),
          { $sort: { 'highlights.createdAt': -1 } },
          { $limit: fetchLimit },
          {
            $project: {
              _id: '$highlights._id',
              articleId: '$_id',
              articleTitle: '$title',
              text: '$highlights.text',
              note: '$highlights.note'
            }
          }
        ]),
        Article.find(articleQuery)
          .select('title content url updatedAt')
          .sort({ updatedAt: -1 })
          .limit(fetchLimit)
          .lean(),
        TagMeta.find(conceptQuery)
          .select('name description updatedAt')
          .sort({ updatedAt: -1 })
          .limit(fetchLimit)
          .lean(),
        Question.find(questionQuery)
          .select('text updatedAt')
          .sort({ updatedAt: -1 })
          .limit(fetchLimit)
          .lean(),
        WikiPage
          ? WikiPage.find(wikiPageQuery)
            .select('title plainText pageType updatedAt')
            .sort({ updatedAt: -1 })
            .limit(fetchLimit)
            .lean()
          : Promise.resolve([])
      ]);

      const notebookItems = notebooks.map(entry => ({
        itemType: 'notebook',
        itemId: String(entry._id),
        title: entry.title || 'Notebook entry',
        snippet: buildQueueSnippet(entry.content, entry.title),
        updatedAt: entry.updatedAt
      }));
      const highlightItems = highlights.map(highlight => ({
        itemType: 'highlight',
        itemId: String(highlight._id),
        articleId: highlight.articleId ? String(highlight.articleId) : '',
        title: highlight.articleTitle || 'Highlight',
        snippet: buildQueueSnippet(highlight.text, highlight.note),
        metadata: {
          articleId: highlight.articleId ? String(highlight.articleId) : ''
        },
        updatedAt: null
      }));
      const articleItems = articles.map(article => ({
        itemType: 'article',
        itemId: String(article._id),
        title: article.title || 'Article',
        snippet: buildQueueSnippet(article.content, article.url, article.title),
        updatedAt: article.updatedAt
      }));
      const conceptItems = concepts.map(concept => ({
        itemType: 'concept',
        itemId: String(concept._id),
        title: concept.name || 'Concept',
        snippet: buildQueueSnippet(concept.description, concept.name),
        updatedAt: concept.updatedAt
      }));
      const questionItems = questions.map(question => ({
        itemType: 'question',
        itemId: String(question._id),
        title: 'Question',
        snippet: buildQueueSnippet(question.text),
        updatedAt: question.updatedAt
      }));
      const wikiItems = wikiPages.map(page => ({
        itemType: 'wiki_page',
        itemId: String(page._id),
        title: page.title || 'Wiki page',
        snippet: buildQueueSnippet(page.plainText, page.pageType, page.title),
        updatedAt: page.updatedAt
      }));

      const results = [...notebookItems, ...highlightItems, ...articleItems, ...conceptItems, ...questionItems, ...wikiItems]
        .filter(item => !(item.itemType === excludeType && item.itemId === excludeId))
        .filter(item => (allowedItemTypes.size === 0 ? true : allowedItemTypes.has(item.itemType)))
        .filter(item => isConnectionItemInScopeCandidates(item.itemType, item.itemId, scopeCandidates))
        .sort((a, b) => {
          const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, limit);

      res.status(200).json(results);
    } catch (error) {
      console.error('❌ Error searching connectable items:', error);
      res.status(500).json({ error: 'Failed to search items.' });
    }
  });

  router.get('/api/connections/scope', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const hasScopeInput = req.query.scopeType !== undefined || req.query.scopeId !== undefined;
      const scope = await resolveConnectionScopeInput(userId, req.query.scopeType, req.query.scopeId, hasScopeInput);
      if (!scope || !scope.scopeType || !scope.scopeId) {
        return res.status(400).json({ error: 'scopeType and scopeId are required.' });
      }

      const limit = Math.max(1, Math.min(120, Number(req.query.limit) || 40));
      const rows = await Connection.find({
        userId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const connections = await Promise.all(rows.map(async (row) => {
        const [fromItem, toItem] = await Promise.all([
          resolveConnectionItem(userId, row.fromType, row.fromId),
          resolveConnectionItem(userId, row.toType, row.toId)
        ]);
        return {
          ...row,
          fromItem,
          toItem
        };
      }));

      res.status(200).json({
        scope: {
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          title: scope.title || ''
        },
        connections: connections.filter(row => row.fromItem && row.toItem)
      });
    } catch (error) {
      console.error('❌ Error listing scope connections:', error);
      res.status(500).json({ error: 'Failed to list scope connections.' });
    }
  });

  router.get('/api/map/graph', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const limit = Math.max(20, Math.min(600, Number(req.query.limit) || 180));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const relationTypes = parseCsvList(req.query.relationTypes)
        .map(value => normalizeRelationType(value))
        .filter(Boolean);
      const itemTypes = parseCsvList(req.query.itemTypes)
        .map(value => normalizeConnectionItemType(value))
        .filter(Boolean);
      const tagFilters = new Set(parseCsvList(req.query.tags).map(tag => tag.toLowerCase()));
      const notebookId = String(req.query.notebookId || '').trim();

      const hasScopeInput = req.query.scopeType !== undefined || req.query.scopeId !== undefined;
      let scope = null;
      if (hasScopeInput) {
        scope = await resolveConnectionScopeInput(userId, req.query.scopeType, req.query.scopeId, true);
        if (!scope) {
          return res.status(400).json({ error: 'Invalid scopeType/scopeId.' });
        }
      }

      const query = { userId };
      if (hasScopeInput) {
        query.scopeType = scope.scopeType || '';
        query.scopeId = scope.scopeId || '';
      }
      if (relationTypes.length > 0) {
        query.relationType = { $in: relationTypes };
      }
      if (itemTypes.length > 0) {
        query.fromType = { $in: itemTypes };
        query.toType = { $in: itemTypes };
      }
      if (notebookId) {
        query.$or = [
          { fromType: 'notebook', fromId: notebookId },
          { toType: 'notebook', toId: notebookId }
        ];
      }

      const rows = await Connection.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit + 1)
        .lean();
      const hasMore = rows.length > limit;
      const edgeRows = hasMore ? rows.slice(0, limit) : rows;

      const idsByType = {
        highlight: new Set(),
        notebook: new Set(),
        article: new Set(),
        concept: new Set(),
        question: new Set(),
        wiki_page: new Set(),
        wiki_claim: new Set()
      };
      edgeRows.forEach(row => {
        addToCandidateSet(idsByType[row.fromType], row.fromId);
        addToCandidateSet(idsByType[row.toType], row.toId);
      });

      const nodeMap = await buildGraphNodeMap(userId, idsByType);
      let edges = edgeRows
        .map(row => ({
          id: String(row._id),
          source: buildGraphNodeKey(row.fromType, row.fromId),
          target: buildGraphNodeKey(row.toType, row.toId),
          relationType: row.relationType,
          createdAt: row.createdAt,
          scopeType: row.scopeType || '',
          scopeId: row.scopeId || ''
        }))
        .filter(edge => nodeMap.has(edge.source) && nodeMap.has(edge.target));
      let nodes = Array.from(nodeMap.values());

      if (tagFilters.size > 0) {
        const matchedNodeIds = new Set(
          nodes
            .filter(node => Array.isArray(node.tags) && node.tags.some(tag => tagFilters.has(String(tag || '').toLowerCase())))
            .map(node => node.id)
        );

        if (matchedNodeIds.size === 0) {
          return res.status(200).json({
            nodes: [],
            edges: [],
            page: {
              limit,
              offset,
              hasMore: false,
              nextOffset: offset
            }
          });
        }

        edges = edges.filter(edge => matchedNodeIds.has(edge.source) || matchedNodeIds.has(edge.target));
        const visibleNodeIds = new Set(matchedNodeIds);
        edges.forEach(edge => {
          visibleNodeIds.add(edge.source);
          visibleNodeIds.add(edge.target);
        });
        nodes = nodes.filter(node => visibleNodeIds.has(node.id));
      }

      res.status(200).json({
        nodes,
        edges,
        page: {
          limit,
          offset,
          hasMore,
          nextOffset: hasMore ? offset + limit : offset
        }
      });
    } catch (error) {
      console.error('❌ Error fetching map graph:', error);
      res.status(500).json({ error: 'Failed to fetch graph.' });
    }
  });

  router.delete('/api/connections/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const deleted = await Connection.findOneAndDelete({ _id: id, userId });
      if (!deleted) {
        return res.status(404).json({ error: 'Connection not found.' });
      }
      const deletedObject = deleted.toObject ? deleted.toObject() : deleted;
      const reciprocalRelationType = INVERSE_CONNECTION_RELATION_TYPES[deletedObject.relationType] || 'referenced_by';
      const reciprocalDeleted = await Connection.findOneAndDelete({
        userId,
        fromType: deletedObject.toType,
        fromId: deletedObject.toId,
        toType: deletedObject.fromType,
        toId: deletedObject.fromId,
        relationType: reciprocalRelationType,
        scopeType: deletedObject.scopeType || '',
        scopeId: deletedObject.scopeId || ''
      });
      res.status(200).json({
        message: 'Connection deleted.',
        reciprocalDeleted: Boolean(reciprocalDeleted)
      });
    } catch (error) {
      console.error('❌ Error deleting connection:', error);
      res.status(500).json({ error: 'Failed to delete connection.' });
    }
  });

  return router;
};

module.exports = { buildConnectionsRouter, INVERSE_CONNECTION_RELATION_TYPES };
