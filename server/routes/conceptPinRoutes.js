const express = require('express');

const buildConceptPinRouter = ({
  mongoose,
  authenticateToken,
  TagMeta,
  markTourSignal
}) => {
  const router = express.Router();

  router.post('/api/concepts/:id/suggestions/dismiss', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { highlightId } = req.body || {};
      if (!highlightId) {
        return res.status(400).json({ error: 'highlightId is required.' });
      }
      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id, userId }
        : { name: id, userId };
      const updated = await TagMeta.findOneAndUpdate(
        query,
        { $addToSet: { dismissedHighlightIds: highlightId } },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      res.status(200).json({ dismissedHighlightIds: updated.dismissedHighlightIds || [] });
    } catch (error) {
      res.status(500).json({ error: 'Failed to dismiss suggestion.' });
    }
  });

  router.post('/api/concepts/:id/add-highlight', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { highlightId } = req.body;
      if (!highlightId) return res.status(400).json({ error: "highlightId is required." });
      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id, userId }
        : { name: id, userId };
      const update = {
        $setOnInsert: { name: String(id) },
        $addToSet: { pinnedHighlightIds: highlightId }
      };
      const concept = await TagMeta.findOneAndUpdate(query, update, {
        new: true,
        upsert: true
      });
      await markTourSignal(req.user.id, 'conceptFromHighlight', 'concept_from_highlight');
      res.status(200).json(concept);
    } catch (error) {
      console.error("❌ Error adding highlight to concept:", error);
      res.status(500).json({ error: "Failed to add highlight to concept." });
    }
  });

  router.put('/api/concepts/:name/pins', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const cleanName = String(req.params.name || '').trim();
      const {
        addHighlightIds = [],
        removeHighlightIds = [],
        addArticleIds = [],
        removeArticleIds = []
      } = req.body || {};

      const update = {};
      if (addHighlightIds.length) {
        update.$addToSet = { ...(update.$addToSet || {}), pinnedHighlightIds: { $each: addHighlightIds } };
      }
      if (removeHighlightIds.length) {
        update.$pull = { ...(update.$pull || {}), pinnedHighlightIds: { $in: removeHighlightIds } };
      }
      if (addArticleIds.length) {
        update.$addToSet = { ...(update.$addToSet || {}), pinnedArticleIds: { $each: addArticleIds } };
      }
      if (removeArticleIds.length) {
        update.$pull = { ...(update.$pull || {}), pinnedArticleIds: { $in: removeArticleIds } };
      }

      const updated = await TagMeta.findOneAndUpdate(
        { name: new RegExp(`^${cleanName}$`, 'i'), userId },
        { name: cleanName, ...update },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      res.status(200).json(updated);
    } catch (error) {
      console.error("❌ Error updating concept pins:", error);
      res.status(500).json({ error: "Failed to update concept pins." });
    }
  });

  return router;
};

module.exports = {
  buildConceptPinRouter
};
