const express = require('express');

const buildHighlightMutationRouter = ({
  mongoose,
  authenticateToken,
  Article,
  normalizeTags,
  enqueueHighlightEmbedding,
  safeMapEmbedding,
  highlightToEmbeddingItem,
  queueEmbeddingUpsert,
  markTourSignal,
  normalizeItemType,
  parseClaimId,
  buildEmbeddingId,
  queueEmbeddingDelete
}) => {
  const router = express.Router();

  router.get('/api/resurface', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);

      const countAgg = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $count: 'total' }
      ]);
      const totalHighlights = countAgg[0]?.total || 0;

      if (totalHighlights === 0) {
        return res.status(200).json({ dailyRandomHighlights: [] });
      }

      const sampleSize = Math.min(5, totalHighlights);

      const dailyRandomHighlights = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $project: {
            _id: '$highlights._id',
            text: '$highlights.text',
            tags: '$highlights.tags',
            articleTitle: '$title',
            articleId: '$_id',
            createdAt: '$highlights.createdAt'
        } },
        { $sample: { size: sampleSize } }
      ]);

      res.status(200).json({ dailyRandomHighlights });
    } catch (error) {
      console.error("❌ Error building resurface feed:", error);
      res.status(500).json({ error: "Failed to load resurfacing highlights." });
    }
  });

  router.post('/articles/:id/highlights', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { text, note, tags, anchor } = req.body;
      const userId = req.user.id;

      const trimmedText = typeof text === 'string' ? text.trim() : '';
      if (trimmedText.length < 3) {
        return res.status(400).json({ error: "Highlight text is required." });
      }

      const newHighlight = {
          text: trimmedText,
          note: note || '',
          tags: normalizeTags(tags),
          type: 'note',
          claimId: null,
          anchor: anchor ? {
            text: anchor.text || trimmedText,
            prefix: anchor.prefix || '',
            suffix: anchor.suffix || '',
            startOffsetApprox: Number.isFinite(anchor.startOffsetApprox)
              ? anchor.startOffsetApprox
              : undefined
          } : undefined
      };

      const updatedArticle = await Article.findOneAndUpdate(
        { _id: id, userId: userId },
        { $push: { highlights: newHighlight } },
        { new: true, populate: ['highlights', 'folder'] }
      );

      if (!updatedArticle) {
        return res.status(404).json({ error: "Article not found or you do not have permission to add highlight." });
      }
      const createdHighlight = updatedArticle.highlights?.[updatedArticle.highlights.length - 1];
      if (createdHighlight) {
        enqueueHighlightEmbedding({ highlight: createdHighlight, article: updatedArticle });
        const highlightItem = safeMapEmbedding(
          () => highlightToEmbeddingItem(
            { ...createdHighlight, articleId: updatedArticle._id, articleTitle: updatedArticle.title },
            String(userId)
          ),
          'highlight'
        );
        if (highlightItem) queueEmbeddingUpsert([highlightItem]);
        await markTourSignal(req.user.id, 'firstHighlightCaptured', 'highlight_captured');
      }
      res.status(200).json({ article: updatedArticle, highlight: createdHighlight });
    } catch (error) {
      console.error("❌ Error adding highlight:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid article ID format." });
      }
      res.status(500).json({ error: "Failed to add highlight.", details: error.message });
    }
  });

  router.patch('/articles/:articleId/highlights/:highlightId', authenticateToken, async (req, res) => {
    try {
        const { articleId, highlightId } = req.params;
        const { note, tags, type, claimId } = req.body;
        const userId = req.user.id;

        const article = await Article.findOne({ _id: articleId, userId: userId });
        if (!article) {
            return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
        }

        const highlight = article.highlights.id(highlightId);
        if (!highlight) {
            return res.status(404).json({ error: "Highlight not found in this article." });
        }

        highlight.note = note !== undefined ? note : highlight.note;
        highlight.tags = tags !== undefined ? normalizeTags(tags) : highlight.tags;
        if (type !== undefined) {
          const nextType = normalizeItemType(type, '');
          if (!nextType) {
            return res.status(400).json({ error: 'type must be one of claim, evidence, note.' });
          }
          highlight.type = nextType;
          if (nextType !== 'evidence') {
            highlight.claimId = null;
          }
        }
        if (claimId !== undefined) {
          const nextClaimId = parseClaimId(claimId);
          if (claimId !== null && claimId !== '' && !nextClaimId) {
            return res.status(400).json({ error: 'Invalid claimId.' });
          }
          highlight.claimId = nextClaimId;
        }
        const finalType = normalizeItemType(highlight.type, 'note');
        if (finalType === 'evidence' && highlight.claimId) {
          const claimArticle = await Article.findOne({ userId, 'highlights._id': highlight.claimId }).select('highlights');
          const claimHighlight = claimArticle?.highlights?.id(highlight.claimId) || null;
          if (!claimHighlight || normalizeItemType(claimHighlight.type, 'note') !== 'claim') {
            return res.status(400).json({ error: 'claimId must reference one of your claim highlights.' });
          }
          if (String(claimHighlight._id) === String(highlight._id)) {
            return res.status(400).json({ error: 'An evidence highlight cannot link to itself as a claim.' });
          }
        } else if (finalType !== 'evidence') {
          highlight.claimId = null;
        }

        await article.save();

        const refreshed = await Article.findById(articleId);
        const updatedHighlight = refreshed.highlights.id(highlightId);
        enqueueHighlightEmbedding({ highlight: updatedHighlight, article: refreshed });
        const highlightItem = safeMapEmbedding(
          () => highlightToEmbeddingItem(
            { ...updatedHighlight, articleId: refreshed._id, articleTitle: refreshed.title },
            String(userId)
          ),
          'highlight'
        );
        if (highlightItem) queueEmbeddingUpsert([highlightItem]);
        res.status(200).json({
          _id: updatedHighlight._id,
          articleId: refreshed._id,
          articleTitle: refreshed.title,
          text: updatedHighlight.text,
          note: updatedHighlight.note,
          tags: updatedHighlight.tags,
          type: normalizeItemType(updatedHighlight.type, 'note'),
          claimId: updatedHighlight.claimId || null,
          createdAt: updatedHighlight.createdAt
        });
    } catch (error) {
        console.error("❌ Error updating highlight:", error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: "Invalid ID format." });
        }
        res.status(500).json({ error: "Failed to update highlight.", details: error.message });
    }
  });

  router.delete('/articles/:articleId/highlights/:highlightId', authenticateToken, async (req, res) => {
    try {
        const { articleId, highlightId } = req.params;
        const userId = req.user.id;

        const article = await Article.findOne({ _id: articleId, userId: userId });
        if (!article) {
            return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
        }

        article.highlights.pull(highlightId);
        await article.save();

        const updatedArticle = await Article.findById(articleId).populate('folder');
        const deleteId = buildEmbeddingId({
          userId: String(userId),
          objectType: 'highlight',
          objectId: String(highlightId)
        });
        queueEmbeddingDelete([deleteId]);
        res.status(200).json(updatedArticle);
    } catch (error) {
        console.error("❌ Error deleting highlight:", error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: "Invalid ID format." });
        }
        res.status(500).json({ error: "Failed to delete highlight.", details: error.message });
    }
  });

  return router;
};

module.exports = {
  buildHighlightMutationRouter
};
