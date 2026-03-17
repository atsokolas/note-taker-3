const express = require('express');

const buildReferenceBacklinkRouter = ({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry,
  Collection,
  ReferenceEdge,
  TagMeta,
  Question,
  buildNotebookBlocksFromEdges,
  loadNotebookBacklinks
}) => {
  const router = express.Router();

  router.get('/api/highlights/:id/references', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const notebookEntries = await NotebookEntry.find({ userId, linkedHighlightIds: id })
        .select('title updatedAt')
        .lean();
      const collections = await Collection.find({ userId, highlightIds: id })
        .select('name slug')
        .lean();
      res.status(200).json({ notebookEntries, collections });
    } catch (error) {
      console.error("❌ Error fetching highlight references:", error);
      res.status(500).json({ error: "Failed to fetch highlight references." });
    }
  });

  router.get('/api/articles/:id/references', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const article = await Article.findOne({ _id: id, userId }).select('highlights').lean();
      if (!article) {
        return res.status(404).json({ error: "Article not found." });
      }
      const highlightIds = (article.highlights || []).map(h => h._id);
      if (highlightIds.length === 0) {
        return res.status(200).json({ highlightCount: 0, notebookEntries: [], collections: [] });
      }
      const notebookEntries = await NotebookEntry.find({ userId, linkedHighlightIds: { $in: highlightIds } })
        .select('title updatedAt')
        .lean();
      const collections = await Collection.find({ userId, highlightIds: { $in: highlightIds } })
        .select('name slug')
        .lean();
      res.status(200).json({
        highlightCount: highlightIds.length,
        notebookEntries,
        collections
      });
    } catch (error) {
      console.error("❌ Error fetching article references:", error);
      res.status(500).json({ error: "Failed to fetch article references." });
    }
  });

  router.get('/api/articles/:id/backlinks', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const article = await Article.findOne({ _id: id, userId }).select('highlights title').lean();
      if (!article) {
        return res.status(404).json({ error: 'Article not found.' });
      }
      const highlightIds = (article.highlights || []).map(h => h._id);
      const directEdges = await ReferenceEdge.find({
        userId,
        targetType: 'article',
        targetId: id
      }).lean();
      const highlightEdges = highlightIds.length > 0
        ? await ReferenceEdge.find({
          userId,
          targetType: 'highlight',
          targetId: { $in: highlightIds }
        }).lean()
        : [];
      const notebookBlocks = await buildNotebookBlocksFromEdges({
        userId,
        edges: [...directEdges, ...highlightEdges]
      });
      const concepts = await TagMeta.find({ userId, pinnedArticleIds: id })
        .select('name description updatedAt')
        .lean();
      const collections = await Collection.find({
        userId,
        $or: [
          { articleIds: id },
          { highlightIds: { $in: highlightIds } }
        ]
      }).select('name slug updatedAt').lean();
      res.status(200).json({
        notebookBlocks,
        concepts,
        questions: [],
        collections
      });
    } catch (error) {
      console.error('❌ Error fetching article backlinks:', error);
      res.status(500).json({ error: 'Failed to fetch backlinks.' });
    }
  });

  router.get('/api/highlights/:id/backlinks', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const highlightAgg = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights._id': new mongoose.Types.ObjectId(id) } },
        { $project: { _id: '$highlights._id' } }
      ]);
      if (highlightAgg.length === 0) {
        return res.status(404).json({ error: 'Highlight not found.' });
      }
      const notebookBlocks = await loadNotebookBacklinks({
        userId,
        targetType: 'highlight',
        targetId: id
      });
      const concepts = await TagMeta.find({ userId, pinnedHighlightIds: id })
        .select('name description updatedAt')
        .lean();
      const questions = await Question.find({ userId, linkedHighlightIds: id })
        .select('text status conceptName linkedTagName updatedAt')
        .lean();
      const collections = await Collection.find({ userId, highlightIds: id })
        .select('name slug updatedAt')
        .lean();
      res.status(200).json({
        notebookBlocks,
        concepts,
        questions,
        collections
      });
    } catch (error) {
      console.error('❌ Error fetching highlight backlinks:', error);
      res.status(500).json({ error: 'Failed to fetch backlinks.' });
    }
  });

  router.get('/api/concepts/:id/backlinks', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      let concept = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        concept = await TagMeta.findOne({ _id: id, userId }).select('name').lean();
      }
      if (!concept) {
        concept = await TagMeta.findOne({ userId, name: new RegExp(`^${id}$`, 'i') }).select('name').lean();
      }
      if (!concept) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      const tagName = String(concept.name || '').toLowerCase();
      const notebookBlocks = await loadNotebookBacklinks({
        userId,
        targetType: 'concept',
        targetTagName: tagName
      });
      const questions = await Question.find({
        userId,
        $or: [
          { conceptName: new RegExp(`^${tagName}$`, 'i') },
          { linkedTagName: new RegExp(`^${tagName}$`, 'i') }
        ]
      }).select('text status conceptName linkedTagName updatedAt').lean();
      res.status(200).json({
        notebookBlocks,
        concepts: [],
        questions,
        collections: []
      });
    } catch (error) {
      console.error('❌ Error fetching concept backlinks:', error);
      res.status(500).json({ error: 'Failed to fetch backlinks.' });
    }
  });

  router.get('/api/questions/:id/backlinks', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const question = await Question.findOne({ _id: id, userId }).select('_id text').lean();
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      const notebookBlocks = await loadNotebookBacklinks({
        userId,
        targetType: 'question',
        targetId: id
      });
      res.status(200).json({
        notebookBlocks,
        concepts: [],
        questions: [],
        collections: []
      });
    } catch (error) {
      console.error('❌ Error fetching question backlinks:', error);
      res.status(500).json({ error: 'Failed to fetch backlinks.' });
    }
  });

  router.get('/api/references/for-highlight/:highlightId', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { highlightId } = req.params;
      const edges = await ReferenceEdge.find({
        userId,
        targetType: 'highlight',
        targetId: highlightId
      }).lean();

      const entryIds = edges.map(edge => edge.sourceId);
      const entries = await NotebookEntry.find({ userId, _id: { $in: entryIds } })
        .select('title updatedAt')
        .lean();
      const entryMap = new Map(entries.map(entry => [entry._id.toString(), entry]));

      const notebookBlocks = edges.map(edge => {
        const entry = entryMap.get(edge.sourceId.toString());
        return {
          notebookEntryId: edge.sourceId,
          notebookTitle: entry?.title || 'Untitled',
          blockId: edge.sourceBlockId,
          blockPreviewText: edge.blockPreviewText || '',
          updatedAt: entry?.updatedAt
        };
      });

      const collections = await Collection.find({ userId, highlightIds: highlightId })
        .select('name slug')
        .lean();

      res.status(200).json({ notebookBlocks, collections });
    } catch (error) {
      console.error('❌ Error fetching references for highlight:', error);
      res.status(500).json({ error: 'Failed to load references.' });
    }
  });

  router.get('/api/references/for-article/:articleId', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { articleId } = req.params;
      const article = await Article.findOne({ _id: articleId, userId }).select('highlights title').lean();
      if (!article) {
        return res.status(404).json({ error: 'Article not found.' });
      }

      const highlightIds = (article.highlights || []).map(h => h._id);
      const edges = await ReferenceEdge.find({
        userId,
        targetType: 'highlight',
        targetId: { $in: highlightIds }
      }).lean();

      const entryIds = edges.map(edge => edge.sourceId);
      const entries = await NotebookEntry.find({ userId, _id: { $in: entryIds } })
        .select('title updatedAt')
        .lean();
      const entryMap = new Map(entries.map(entry => [entry._id.toString(), entry]));

      const notebookBlocks = edges.map(edge => {
        const entry = entryMap.get(edge.sourceId.toString());
        return {
          notebookEntryId: edge.sourceId,
          notebookTitle: entry?.title || 'Untitled',
          blockId: edge.sourceBlockId,
          blockPreviewText: edge.blockPreviewText || '',
          updatedAt: entry?.updatedAt
        };
      });

      const collections = await Collection.find({
        userId,
        $or: [
          { articleIds: articleId },
          { highlightIds: { $in: highlightIds } }
        ]
      }).select('name slug').lean();

      res.status(200).json({ notebookBlocks, collections });
    } catch (error) {
      console.error('❌ Error fetching references for article:', error);
      res.status(500).json({ error: 'Failed to load references.' });
    }
  });

  router.get('/api/references/for-concept/:tagName', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const tagName = String(req.params.tagName || '').toLowerCase();
      const edges = await ReferenceEdge.find({
        userId,
        targetType: 'concept',
        targetTagName: tagName
      }).lean();

      const entryIds = edges.map(edge => edge.sourceId);
      const entries = await NotebookEntry.find({ userId, _id: { $in: entryIds } })
        .select('title updatedAt')
        .lean();
      const entryMap = new Map(entries.map(entry => [entry._id.toString(), entry]));

      const notebookBlocks = edges.map(edge => {
        const entry = entryMap.get(edge.sourceId.toString());
        return {
          notebookEntryId: edge.sourceId,
          notebookTitle: entry?.title || 'Untitled',
          blockId: edge.sourceBlockId,
          blockPreviewText: edge.blockPreviewText || '',
          updatedAt: entry?.updatedAt
        };
      });

      res.status(200).json({ notebookBlocks, collections: [] });
    } catch (error) {
      console.error('❌ Error fetching references for concept:', error);
      res.status(500).json({ error: 'Failed to load references.' });
    }
  });

  router.get('/api/references/for-notebook/:notebookId', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { notebookId } = req.params;
      const edges = await ReferenceEdge.find({
        userId,
        sourceType: 'notebook',
        sourceId: notebookId
      }).lean();

      const entry = await NotebookEntry.findOne({ userId, _id: notebookId }).select('title updatedAt').lean();
      const notebookBlocks = edges.map(edge => ({
        notebookEntryId: edge.sourceId,
        notebookTitle: entry?.title || 'Untitled',
        blockId: edge.sourceBlockId,
        blockPreviewText: edge.blockPreviewText || '',
        updatedAt: entry?.updatedAt,
        targetType: edge.targetType,
        targetId: edge.targetId,
        targetTagName: edge.targetTagName
      }));

      res.status(200).json({ notebookBlocks, collections: [] });
    } catch (error) {
      console.error('❌ Error fetching references for notebook:', error);
      res.status(500).json({ error: 'Failed to load references.' });
    }
  });

  return router;
};

module.exports = {
  buildReferenceBacklinkRouter
};
