const express = require('express');

const buildConceptSuggestionRouter = ({
  mongoose,
  authenticateToken,
  TagMeta,
  buildEmbeddingId,
  fetchSimilarEmbeddings,
  hydrateSemanticResults,
  EmbeddingError,
  sendEmbeddingError
}) => {
  const router = express.Router();

  router.get('/api/concepts/:id/suggestions', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id, userId }
        : { name: id, userId };
      const concept = await TagMeta.findOne(query)
        .select('name pinnedHighlightIds dismissedHighlightIds');
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
        types: ['highlight'],
        limit: limit + 5,
        requestId: req.requestId
      });
      let results = await hydrateSemanticResults({ matches, userId });
      const pinnedSet = new Set((concept.pinnedHighlightIds || []).map(item => String(item)));
      const dismissedSet = new Set((concept.dismissedHighlightIds || []).map(item => String(item)));
      results = results
        .filter(item => item.objectType === 'highlight')
        .filter(item => !pinnedSet.has(String(item.objectId)))
        .filter(item => !dismissedSet.has(String(item.objectId)))
        .slice(0, limit);
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
  buildConceptSuggestionRouter
};
