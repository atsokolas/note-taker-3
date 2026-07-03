const express = require('express');
const {
  buildWikiOpenQuestionRows,
  filterWikiOpenQuestions
} = require('../services/wikiOpenQuestionsService');

const buildConceptQuestionBoardRouter = ({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry,
  ReferenceEdge,
  ConceptNote,
  Question,
  WikiPage,
  enqueueQuestionEmbedding,
  findHighlightById,
  createBlockId,
  normalizeBoardScopeType,
  normalizeBoardScopeId,
  TagMeta,
  escapeRegExp,
  Board,
  BoardItem,
  BoardEdge,
  ensureBoardOwnership,
  normalizeBoardItemType,
  normalizeBoardItemRole,
  resolveBoardItemPayload,
  normalizeBoardNumber,
  normalizeBoardRelation
}) => {
  const router = express.Router();

  const loadWikiOpenQuestions = async (userId, filters = {}) => {
    if (!WikiPage?.find) return [];
    const wikiPages = await WikiPage.find({
      userId,
      status: { $ne: 'archived' },
      hiddenFromHome: { $ne: true },
      debugOnly: { $ne: true },
      archived: { $ne: true }
    })
      .select('_id title body status hiddenFromHome debugOnly archived updatedAt createdAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(200)
      .lean();
    return filterWikiOpenQuestions(buildWikiOpenQuestionRows(wikiPages), filters);
  };

  router.get('/api/onboarding/summary', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);

      const [articleCount, notebookCount, highlightCountAgg, taggedHighlightAgg, linkedHighlightEdge] = await Promise.all([
        Article.countDocuments({ userId }),
        NotebookEntry.countDocuments({ userId }),
        Article.aggregate([
          { $match: { userId } },
          { $unwind: '$highlights' },
          { $count: 'total' }
        ]),
        Article.aggregate([
          { $match: { userId } },
          { $unwind: '$highlights' },
          { $match: { 'highlights.tags.0': { $exists: true } } },
          { $limit: 1 }
        ]),
        ReferenceEdge.findOne({ userId, sourceType: 'notebook', targetType: 'highlight' }).lean()
      ]);

      const hasHighlights = (highlightCountAgg[0]?.total || 0) > 0;
      const hasTaggedHighlight = taggedHighlightAgg.length > 0;

      res.status(200).json({
        hasArticle: articleCount > 0,
        hasHighlight: hasHighlights,
        hasTaggedHighlight,
        hasNote: notebookCount > 0,
        hasLinkedHighlight: Boolean(linkedHighlightEdge)
      });
    } catch (error) {
      console.error('❌ Error building onboarding summary:', error);
      res.status(500).json({ error: 'Failed to load onboarding summary.' });
    }
  });

  router.get('/api/concepts/:tagName/notes', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const tagName = req.params.tagName;
      const notes = await ConceptNote.find({
        userId,
        tagName: { $regex: new RegExp(`^${tagName}$`, 'i') }
      }).sort({ updatedAt: -1 });
      res.status(200).json(notes);
    } catch (error) {
      console.error("❌ Error fetching concept notes:", error);
      res.status(500).json({ error: "Failed to fetch concept notes." });
    }
  });

  router.get('/api/concepts/:tagName/timeline', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const { tagName } = req.params;
      const range = req.query.range || '90d';

      const escapeTimelineRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tagRegex = new RegExp(`^${escapeTimelineRegExp(tagName)}$`, 'i');

      let startDate = null;
      if (range !== 'all') {
        const days = parseInt(range.replace(/d/i, ''), 10);
        const validDays = Number.isNaN(days) ? 90 : days;
        startDate = new Date(Date.now() - validDays * 24 * 60 * 60 * 1000);
      }

      const highlightMatch = {
        userId,
        ...(startDate ? { 'highlights.createdAt': { $gte: startDate } } : {})
      };

      const highlightPipeline = [
        { $match: { userId } },
        { $unwind: '$highlights' },
        ...(startDate ? [{ $match: { 'highlights.createdAt': { $gte: startDate } } }] : []),
        { $match: { 'highlights.tags': { $regex: tagRegex } } },
        {
          $group: {
            _id: {
              $dateTrunc: { date: '$highlights.createdAt', unit: 'week', timezone: 'UTC' }
            },
            count: { $sum: 1 }
          }
        },
        { $project: { _id: 0, weekStartDate: '$_id', count: 1 } },
        { $sort: { weekStartDate: 1 } }
      ];

      const topArticlesPipeline = [
        { $match: { userId } },
        { $unwind: '$highlights' },
        ...(startDate ? [{ $match: { 'highlights.createdAt': { $gte: startDate } } }] : []),
        { $match: { 'highlights.tags': { $regex: tagRegex } } },
        {
          $group: {
            _id: '$_id',
            title: { $first: '$title' },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, articleId: '$_id', title: 1, count: 1 } }
      ];

      const noteEdgesPipeline = [
        { $match: { userId, targetType: 'concept', targetTagName: { $regex: tagRegex } } },
        {
          $lookup: {
            from: 'notebookentries',
            localField: 'sourceId',
            foreignField: '_id',
            as: 'entry'
          }
        },
        { $unwind: '$entry' },
        ...(startDate ? [{ $match: { 'entry.createdAt': { $gte: startDate } } }] : []),
        { $group: { _id: '$entry._id', createdAt: { $first: '$entry.createdAt' } } },
        {
          $group: {
            _id: { $dateTrunc: { date: '$createdAt', unit: 'week', timezone: 'UTC' } },
            count: { $sum: 1 }
          }
        },
        { $project: { _id: 0, weekStartDate: '$_id', count: 1 } },
        { $sort: { weekStartDate: 1 } }
      ];

      const conceptNotesPipeline = [
        { $match: { userId, tagName: { $regex: tagRegex } } },
        ...(startDate ? [{ $match: { createdAt: { $gte: startDate } } }] : []),
        {
          $group: {
            _id: { $dateTrunc: { date: '$createdAt', unit: 'week', timezone: 'UTC' } },
            count: { $sum: 1 }
          }
        },
        { $project: { _id: 0, weekStartDate: '$_id', count: 1 } },
        { $sort: { weekStartDate: 1 } }
      ];

      const [highlightsPerWeek, topReferencedArticles, noteEdgesPerWeek, conceptNotesPerWeek] = await Promise.all([
        Article.aggregate(highlightPipeline),
        Article.aggregate(topArticlesPipeline),
        ReferenceEdge.aggregate(noteEdgesPipeline),
        ConceptNote.aggregate(conceptNotesPipeline)
      ]);

      const notesByWeek = new Map();
      const addWeekCounts = (rows) => {
        rows.forEach(row => {
          const key = new Date(row.weekStartDate).toISOString();
          const current = notesByWeek.get(key) || 0;
          notesByWeek.set(key, current + row.count);
        });
      };
      addWeekCounts(noteEdgesPerWeek);
      addWeekCounts(conceptNotesPerWeek);

      const notesCreatedPerWeek = Array.from(notesByWeek.entries())
        .map(([weekStartDate, count]) => ({ weekStartDate, count }))
        .sort((a, b) => new Date(a.weekStartDate) - new Date(b.weekStartDate));

      res.status(200).json({
        highlightsPerWeek,
        notesCreatedPerWeek,
        topReferencedArticles
      });
    } catch (error) {
      console.error('❌ Error building concept timeline:', error);
      res.status(500).json({ error: 'Failed to load concept timeline.' });
    }
  });

  router.post('/api/concepts/:tagName/notes', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const tagName = req.params.tagName;
      const { title = '', content = '' } = req.body;
      const note = await ConceptNote.create({ tagName, title, content, userId });
      res.status(201).json(note);
    } catch (error) {
      console.error("❌ Error creating concept note:", error);
      res.status(500).json({ error: "Failed to create concept note." });
    }
  });

  router.put('/api/concepts/notes/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { title = '', content = '' } = req.body;
      const updated = await ConceptNote.findOneAndUpdate(
        { _id: id, userId },
        { title, content },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: "Note not found." });
      res.status(200).json(updated);
    } catch (error) {
      console.error("❌ Error updating concept note:", error);
      res.status(500).json({ error: "Failed to update concept note." });
    }
  });

  router.delete('/api/concepts/notes/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const removed = await ConceptNote.findOneAndDelete({ _id: id, userId });
      if (!removed) return res.status(404).json({ error: "Note not found." });
      res.status(200).json({ message: "Note deleted." });
    } catch (error) {
      console.error("❌ Error deleting concept note:", error);
      res.status(500).json({ error: "Failed to delete concept note." });
    }
  });

  router.get('/api/concepts/:name/questions', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const conceptName = req.params.name;
      const status = req.query.status || 'open';
      const nameRegex = new RegExp(`^${conceptName}$`, 'i');
      const [questions, wikiOpenQuestions] = await Promise.all([
        Question.find({
          userId,
          status,
          linkedTagName: nameRegex
        }).sort({ createdAt: -1 }).lean(),
        loadWikiOpenQuestions(userId, { conceptName, status })
      ]);
      res.status(200).json([...questions, ...wikiOpenQuestions]);
    } catch (error) {
      console.error("❌ Error fetching concept questions:", error);
      res.status(500).json({ error: "Failed to fetch questions." });
    }
  });

  router.get('/api/questions', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { status, tag, conceptName, highlightId, notebookEntryId } = req.query;
      const filter = { userId };
      if (status) filter.status = status;
      if (tag) filter.linkedTagName = tag;
      if (conceptName) filter.linkedTagName = new RegExp(`^${conceptName}$`, 'i');
      if (highlightId) filter.linkedHighlightId = highlightId;
      if (notebookEntryId) filter.linkedNotebookEntryId = notebookEntryId;
      const [questions, wikiOpenQuestions] = await Promise.all([
        Question.find(filter).sort({ createdAt: -1 }).lean(),
        (highlightId || notebookEntryId)
          ? Promise.resolve([])
          : loadWikiOpenQuestions(userId, { tag, conceptName, status })
      ]);
      res.status(200).json([...questions, ...wikiOpenQuestions]);
    } catch (error) {
      console.error("❌ Error fetching questions:", error);
      res.status(500).json({ error: "Failed to fetch questions." });
    }
  });

  router.get('/api/questions/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const question = await Question.findOne({ _id: id, userId });
      if (!question) return res.status(404).json({ error: "Question not found." });
      res.status(200).json(question);
    } catch (error) {
      console.error("❌ Error fetching question:", error);
      res.status(500).json({ error: "Failed to fetch question." });
    }
  });

  router.post('/api/questions', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        text,
        status = 'open',
        linkedTagName = '',
        conceptName = '',
        blocks = [],
        linkedHighlightId = null,
        linkedHighlightIds = [],
        linkedNotebookEntryId = null
      } = req.body;
      if (!text || !text.trim()) return res.status(400).json({ error: "Question text is required." });
      const highlightIds = [
        ...(Array.isArray(linkedHighlightIds) ? linkedHighlightIds : []),
        ...(linkedHighlightId ? [linkedHighlightId] : [])
      ].filter(Boolean);
      const normalizedConcept = (conceptName || linkedTagName || '').trim();
      const question = await Question.create({
        text: text.trim(),
        status,
        linkedTagName: (linkedTagName || normalizedConcept || '').trim(),
        conceptName: normalizedConcept,
        blocks: Array.isArray(blocks) ? blocks : [],
        linkedHighlightId,
        linkedHighlightIds: highlightIds,
        linkedNotebookEntryId,
        userId
      });
      enqueueQuestionEmbedding(question);
      res.status(201).json(question);
    } catch (error) {
      console.error("❌ Error creating question:", error);
      res.status(500).json({ error: "Failed to create question." });
    }
  });

  router.put('/api/questions/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { text, status, linkedTagName, conceptName, blocks, linkedHighlightId, linkedHighlightIds, linkedNotebookEntryId } = req.body;
      const payload = {};
      if (text !== undefined) payload.text = text;
      if (status !== undefined) payload.status = status;
      if (linkedTagName !== undefined) payload.linkedTagName = linkedTagName;
      if (conceptName !== undefined) {
        payload.conceptName = conceptName;
        if (linkedTagName === undefined) payload.linkedTagName = conceptName;
      }
      if (blocks !== undefined) payload.blocks = Array.isArray(blocks) ? blocks : [];
      if (linkedHighlightId !== undefined) payload.linkedHighlightId = linkedHighlightId;
      if (linkedHighlightIds !== undefined) payload.linkedHighlightIds = linkedHighlightIds;
      if (linkedNotebookEntryId !== undefined) payload.linkedNotebookEntryId = linkedNotebookEntryId;
      const updated = await Question.findOneAndUpdate({ _id: id, userId }, payload, { new: true });
      if (!updated) return res.status(404).json({ error: "Question not found." });
      enqueueQuestionEmbedding(updated);
      res.status(200).json(updated);
    } catch (error) {
      console.error("❌ Error updating question:", error);
      res.status(500).json({ error: "Failed to update question." });
    }
  });

  router.post('/api/questions/:id/add-highlight', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { highlightId } = req.body;
      if (!highlightId) return res.status(400).json({ error: "highlightId is required." });
      const question = await Question.findOne({ _id: id, userId });
      if (!question) return res.status(404).json({ error: "Question not found." });
      const highlight = await findHighlightById(userId, highlightId);
      if (!highlight) return res.status(404).json({ error: "Highlight not found." });

      const hasBlock = (question.blocks || []).some(block =>
        block.type === 'highlight-ref' && String(block.highlightId) === String(highlightId)
      );
      if (!hasBlock) {
        question.blocks = question.blocks || [];
        question.blocks.push({
          id: createBlockId(),
          type: 'highlight-ref',
          text: highlight.text || '',
          highlightId
        });
      }
      question.linkedHighlightIds = question.linkedHighlightIds || [];
      if (!question.linkedHighlightIds.some(idValue => String(idValue) === String(highlightId))) {
        question.linkedHighlightIds.push(highlightId);
      }
      await question.save();
      res.status(200).json(question);
    } catch (error) {
      console.error("❌ Error adding highlight to question:", error);
      res.status(500).json({ error: "Failed to add highlight to question." });
    }
  });

  router.delete('/api/questions/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const removed = await Question.findOneAndDelete({ _id: id, userId });
      if (!removed) return res.status(404).json({ error: "Question not found." });
      res.status(200).json({ message: "Deleted." });
    } catch (error) {
      console.error("❌ Error deleting question:", error);
      res.status(500).json({ error: "Failed to delete question." });
    }
  });

  router.post('/api/questions/:id/link-highlight', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { highlightId } = req.body;
      if (!highlightId) return res.status(400).json({ error: "highlightId is required." });
      const updated = await Question.findOneAndUpdate(
        { _id: id, userId },
        { $addToSet: { linkedHighlightIds: highlightId } },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: "Question not found." });
      res.status(200).json(updated);
    } catch (error) {
      console.error("❌ Error linking highlight to question:", error);
      res.status(500).json({ error: "Failed to link highlight." });
    }
  });

  router.get('/api/boards/:scopeType/:scopeId', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const scopeType = normalizeBoardScopeType(req.params.scopeType);
      if (!scopeType) return res.status(400).json({ error: 'Invalid scopeType.' });
      let scopeId = normalizeBoardScopeId(scopeType, req.params.scopeId);
      if (!scopeId) return res.status(400).json({ error: 'scopeId is required.' });
      if (scopeType === 'concept') {
        if (mongoose.Types.ObjectId.isValid(scopeId)) {
          const conceptExists = await TagMeta.exists({ _id: scopeId, userId });
          if (!conceptExists) return res.status(404).json({ error: 'Concept not found.' });
          scopeId = String(scopeId);
        } else {
          const conceptByName = await TagMeta.findOne({
            name: new RegExp(`^${escapeRegExp(scopeId)}$`, 'i'),
            userId
          }).select('_id');
          if (!conceptByName) return res.status(404).json({ error: 'Concept not found.' });
          scopeId = String(conceptByName._id);
        }
      }
      if (scopeType === 'question') {
        if (!mongoose.Types.ObjectId.isValid(scopeId)) {
          return res.status(400).json({ error: 'Invalid question scopeId.' });
        }
        const questionExists = await Question.exists({ _id: scopeId, userId });
        if (!questionExists) return res.status(404).json({ error: 'Question not found.' });
      }

      const board = await Board.findOneAndUpdate(
        { userId, scopeType, scopeId },
        { $setOnInsert: { userId, scopeType, scopeId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      const items = await BoardItem.find({ boardId: board._id }).sort({ createdAt: 1, _id: 1 });
      const edges = await BoardEdge.find({ boardId: board._id }).sort({ createdAt: 1, _id: 1 });
      res.status(200).json({ board, items, edges });
    } catch (error) {
      console.error('❌ Error loading board:', error);
      res.status(500).json({ error: 'Failed to load board.' });
    }
  });

  router.post('/api/boards/:boardId/items', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const board = await ensureBoardOwnership(userId, req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found.' });

      const type = normalizeBoardItemType(req.body?.type);
      if (!type) return res.status(400).json({ error: 'Invalid item type.' });
      const role = normalizeBoardItemRole(req.body?.role, 'idea');

      const payload = await resolveBoardItemPayload({
        userId,
        type,
        sourceId: req.body?.sourceId,
        text: req.body?.text
      });
      if (!payload) {
        return res.status(400).json({ error: 'sourceId is invalid for this item type.' });
      }

      const item = await BoardItem.create({
        boardId: board._id,
        type,
        role,
        sourceId: payload.sourceId,
        noteId: payload.noteId,
        articleId: payload.articleId,
        highlightId: payload.highlightId,
        text: payload.text,
        x: normalizeBoardNumber(req.body?.x, 40),
        y: normalizeBoardNumber(req.body?.y, 40),
        w: normalizeBoardNumber(req.body?.w, 320, { min: 180, max: 1800 }),
        h: normalizeBoardNumber(req.body?.h, 220, { min: 120, max: 1400 })
      });

      await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
      res.status(201).json(item);
    } catch (error) {
      console.error('❌ Error creating board item:', error);
      res.status(500).json({ error: 'Failed to create board item.' });
    }
  });

  router.put('/api/boards/:boardId/items', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const board = await ensureBoardOwnership(userId, req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found.' });

      const updates = Array.isArray(req.body?.items) ? req.body.items : [];
      if (updates.length === 0) return res.status(200).json({ items: [] });

      const ops = updates
        .filter(item => item && mongoose.Types.ObjectId.isValid(item._id))
        .map(item => ({
          updateOne: {
            filter: { _id: item._id, boardId: board._id },
            update: {
              $set: {
                x: normalizeBoardNumber(item.x, 0),
                y: normalizeBoardNumber(item.y, 0),
                w: normalizeBoardNumber(item.w, 320, { min: 180, max: 1800 }),
                h: normalizeBoardNumber(item.h, 220, { min: 120, max: 1400 })
              }
            }
          }
        }));

      if (ops.length > 0) {
        await BoardItem.bulkWrite(ops, { ordered: false });
        await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
      }

      const items = await BoardItem.find({ boardId: board._id }).sort({ createdAt: 1, _id: 1 });
      res.status(200).json({ items });
    } catch (error) {
      console.error('❌ Error updating board items:', error);
      res.status(500).json({ error: 'Failed to update board items.' });
    }
  });

  router.patch('/api/boards/:boardId/items/:itemId', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const board = await ensureBoardOwnership(userId, req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found.' });

      const existing = await BoardItem.findOne({ _id: req.params.itemId, boardId: board._id });
      if (!existing) return res.status(404).json({ error: 'Board item not found.' });

      const patch = {};
      if (typeof req.body?.role !== 'undefined') {
        patch.role = normalizeBoardItemRole(req.body.role, '');
        if (!patch.role) return res.status(400).json({ error: 'Invalid role.' });
        if (patch.role === 'evidence') {
          const sourceId = String(existing.sourceId || '').trim();
          if (sourceId) {
            if (existing.type === 'note' && !existing.noteId) patch.noteId = sourceId;
            if (existing.type === 'article' && !existing.articleId) patch.articleId = sourceId;
            if (existing.type === 'highlight' && !existing.highlightId) patch.highlightId = sourceId;
          }
        }
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No updates provided.' });
      }

      const item = await BoardItem.findOneAndUpdate(
        { _id: existing._id, boardId: board._id },
        { $set: patch },
        { new: true }
      );
      if (!item) return res.status(404).json({ error: 'Board item not found.' });

      await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
      res.status(200).json(item);
    } catch (error) {
      console.error('❌ Error patching board item:', error);
      res.status(500).json({ error: 'Failed to update board item.' });
    }
  });

  router.post('/api/boards/:boardId/edges', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const board = await ensureBoardOwnership(userId, req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found.' });

      const fromItemId = String(req.body?.fromItemId || '').trim();
      const toItemId = String(req.body?.toItemId || '').trim();
      const relation = normalizeBoardRelation(req.body?.relation);
      if (!mongoose.Types.ObjectId.isValid(fromItemId) || !mongoose.Types.ObjectId.isValid(toItemId)) {
        return res.status(400).json({ error: 'fromItemId and toItemId are required.' });
      }
      if (!relation) return res.status(400).json({ error: 'Invalid relation.' });
      if (fromItemId === toItemId) return res.status(400).json({ error: 'Cannot link a card to itself.' });

      const [fromItem, toItem] = await Promise.all([
        BoardItem.findOne({ _id: fromItemId, boardId: board._id }).select('_id'),
        BoardItem.findOne({ _id: toItemId, boardId: board._id }).select('_id')
      ]);
      if (!fromItem || !toItem) return res.status(404).json({ error: 'Board item not found.' });

      let edge;
      try {
        edge = await BoardEdge.create({
          boardId: board._id,
          fromItemId: fromItem._id,
          toItemId: toItem._id,
          relation
        });
      } catch (error) {
        if (error?.code === 11000) {
          edge = await BoardEdge.findOne({
            boardId: board._id,
            fromItemId: fromItem._id,
            toItemId: toItem._id,
            relation
          });
        } else {
          throw error;
        }
      }

      await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
      res.status(201).json(edge);
    } catch (error) {
      console.error('❌ Error creating board edge:', error);
      res.status(500).json({ error: 'Failed to create board edge.' });
    }
  });

  router.delete('/api/boards/:boardId/edges/:edgeId', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const board = await ensureBoardOwnership(userId, req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found.' });

      const removed = await BoardEdge.findOneAndDelete({ _id: req.params.edgeId, boardId: board._id });
      if (!removed) return res.status(404).json({ error: 'Board edge not found.' });

      await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
      res.status(200).json({ message: 'Deleted.' });
    } catch (error) {
      console.error('❌ Error deleting board edge:', error);
      res.status(500).json({ error: 'Failed to delete board edge.' });
    }
  });

  router.delete('/api/boards/:boardId/items/:itemId', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const board = await ensureBoardOwnership(userId, req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found.' });
      const removed = await BoardItem.findOneAndDelete({ _id: req.params.itemId, boardId: board._id });
      if (!removed) return res.status(404).json({ error: 'Board item not found.' });
      await BoardEdge.deleteMany({
        boardId: board._id,
        $or: [
          { fromItemId: removed._id },
          { toItemId: removed._id }
        ]
      });
      await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
      res.status(200).json({ message: 'Deleted.' });
    } catch (error) {
      console.error('❌ Error deleting board item:', error);
      res.status(500).json({ error: 'Failed to delete board item.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptQuestionBoardRouter
};
