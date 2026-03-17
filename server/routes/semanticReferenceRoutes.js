const express = require('express');

const buildSemanticReferenceRouter = ({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry,
  Collection,
  ConceptNote,
  Question,
  TagMeta,
  buildEmbeddingId,
  fetchSimilarEmbeddings,
  hydrateSemanticResults,
  filterOutIds,
  EmbeddingError,
  sendEmbeddingError
}) => {
  const router = express.Router();

  router.get('/api/concepts/:tagName/references', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { tagName } = req.params;

      const highlightAgg = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': tagName } },
        { $project: { _id: '$highlights._id' } }
      ]);
      const highlightIds = highlightAgg.map(h => h._id);

      const notebookEntries = await NotebookEntry.find({
        userId,
        $or: [
          { linkedHighlightIds: { $in: highlightIds } },
          { content: { $regex: new RegExp(`#${tagName}\\b`, 'i') } }
        ]
      }).select('title updatedAt').lean();

      const collections = await Collection.find({
        userId,
        highlightIds: { $in: highlightIds }
      }).select('name slug').lean();

      const notesCount = await ConceptNote.countDocuments({
        userId,
        tagName: { $regex: new RegExp(`^${tagName}$`, 'i') }
      });

      res.status(200).json({
        notebookEntries,
        collections,
        conceptNotesCount: notesCount
      });
    } catch (error) {
      console.error("❌ Error fetching concept references:", error);
      res.status(500).json({ error: "Failed to fetch concept references." });
    }
  });

  router.get('/api/highlights/:id/related', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const sourceId = buildEmbeddingId({
        userId: String(userId),
        objectType: 'highlight',
        objectId: String(id)
      });
      const matches = await fetchSimilarEmbeddings({
        userId,
        sourceId,
        types: ['highlight'],
        limit: 6,
        requestId: req.requestId
      });
      const results = await hydrateSemanticResults({ matches, userId });
      res.status(200).json({ results });
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/concepts/:id/related', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id, userId }
        : { name: id, userId };
      const concept = await TagMeta.findOne(query)
        .select('name pinnedHighlightIds')
        .lean();
      if (!concept) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      const sourceId = buildEmbeddingId({
        userId: String(userId),
        objectType: 'concept',
        objectId: String(concept._id || concept.name)
      });
      const matches = await fetchSimilarEmbeddings({
        userId,
        sourceId,
        types: ['highlight', 'concept'],
        limit: 12,
        requestId: req.requestId
      });
      let results = await hydrateSemanticResults({ matches, userId });
      const pinnedSet = new Set((concept.pinnedHighlightIds || []).map(item => String(item)));
      results = filterOutIds(results, 'highlight', pinnedSet);
      results = results.filter(item => {
        if (item.objectType !== 'concept') return true;
        const metadataName = item.metadata?.name || '';
        if (metadataName && metadataName === concept.name) return false;
        if (String(item.objectId) === String(concept._id)) return false;
        return true;
      });
      res.status(200).json({ results });
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/questions/:id/related', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const question = await Question.findOne({ _id: id, userId })
        .select('conceptName linkedTagName linkedHighlightIds')
        .lean();
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      const sourceId = buildEmbeddingId({
        userId: String(userId),
        objectType: 'question',
        objectId: String(question._id)
      });
      const matches = await fetchSimilarEmbeddings({
        userId,
        sourceId,
        types: ['highlight', 'concept'],
        limit: 12,
        requestId: req.requestId
      });
      let results = await hydrateSemanticResults({ matches, userId });
      const linkedSet = new Set((question.linkedHighlightIds || []).map(item => String(item)));
      results = filterOutIds(results, 'highlight', linkedSet);
      const conceptName = question.conceptName || question.linkedTagName || '';
      if (conceptName) {
        results = results.filter(item => {
          if (item.objectType !== 'concept') return true;
          const metadataName = item.metadata?.name || item.title || '';
          return metadataName !== conceptName;
        });
      }
      res.status(200).json({ results });
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/notebook/:id/related', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const entry = await NotebookEntry.findOne({ _id: id, userId })
        .select('blocks title')
        .lean();
      if (!entry) {
        return res.status(404).json({ error: 'Notebook entry not found.' });
      }
      const firstBlock = entry.blocks?.[0];
      if (!firstBlock?.id) {
        return res.status(200).json({ results: [] });
      }
      const sourceId = buildEmbeddingId({
        userId: String(userId),
        objectType: 'notebook_block',
        objectId: String(entry._id),
        subId: String(firstBlock.id)
      });
      const matches = await fetchSimilarEmbeddings({
        userId,
        sourceId,
        types: ['highlight', 'concept', 'question', 'article'],
        limit: 12,
        requestId: req.requestId
      });
      const results = await hydrateSemanticResults({ matches, userId });
      res.status(200).json({ results });
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

module.exports = {
  buildSemanticReferenceRouter
};
