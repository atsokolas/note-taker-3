const express = require('express');

const buildConceptMaterialRouter = ({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry,
  resolveConceptByParam
}) => {
  const router = express.Router();

  router.get('/api/concepts/:conceptId/material', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      const userObjectId = new mongoose.Types.ObjectId(req.user.id);
      const concept = await resolveConceptByParam(req.user.id, conceptId, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const pinnedHighlightIds = Array.isArray(concept.pinnedHighlightIds) ? concept.pinnedHighlightIds : [];
      const pinnedArticleIds = Array.isArray(concept.pinnedArticleIds) ? concept.pinnedArticleIds : [];
      const pinnedNoteIds = Array.isArray(concept.pinnedNoteIds) ? concept.pinnedNoteIds : [];
      const pinnedHighlightIdSet = new Set(pinnedHighlightIds.map(id => String(id)));

      const pinnedHighlightsRaw = pinnedHighlightIds.length > 0
        ? await Article.aggregate([
            { $match: { userId: userObjectId } },
            { $unwind: '$highlights' },
            { $match: { 'highlights._id': { $in: pinnedHighlightIds } } },
            {
              $project: {
                _id: '$highlights._id',
                articleId: '$_id',
                articleTitle: '$title',
                text: '$highlights.text',
                note: '$highlights.note',
                tags: '$highlights.tags',
                type: '$highlights.type',
                createdAt: '$highlights.createdAt'
              }
            }
          ])
        : [];

      const pinnedHighlightById = new Map(pinnedHighlightsRaw.map(item => [String(item._id), item]));
      const pinnedHighlights = pinnedHighlightIds
        .map(id => pinnedHighlightById.get(String(id)))
        .filter(Boolean);

      const recentHighlightRows = await Article.aggregate([
        { $match: { userId: userObjectId } },
        { $unwind: '$highlights' },
        { $sort: { 'highlights.createdAt': -1 } },
        { $limit: 220 },
        {
          $project: {
            _id: '$highlights._id',
            articleId: '$_id',
            articleTitle: '$title',
            text: '$highlights.text',
            note: '$highlights.note',
            tags: '$highlights.tags',
            type: '$highlights.type',
            createdAt: '$highlights.createdAt'
          }
        }
      ]);

      const recentHighlights = [];
      for (const row of recentHighlightRows) {
        const id = String(row?._id || '');
        if (!id || pinnedHighlightIdSet.has(id)) continue;
        recentHighlights.push(row);
        if (recentHighlights.length >= 50) break;
      }

      const linkedArticles = pinnedArticleIds.length > 0
        ? await Article.aggregate([
            {
              $match: {
                userId: userObjectId,
                _id: { $in: pinnedArticleIds }
              }
            },
            {
              $project: {
                title: 1,
                url: 1,
                createdAt: 1,
                highlightCount: { $size: { $ifNull: ['$highlights', []] } }
              }
            },
            { $sort: { createdAt: -1 } },
            { $limit: 200 }
          ])
        : [];

      const linkedNotes = pinnedNoteIds.length > 0
        ? await NotebookEntry.aggregate([
            {
              $match: {
                userId: userObjectId,
                _id: { $in: pinnedNoteIds }
              }
            },
            {
              $project: {
                title: 1,
                content: 1,
                blocks: 1,
                createdAt: 1,
                updatedAt: 1
              }
            },
            { $sort: { updatedAt: -1 } },
            { $limit: 200 }
          ])
        : [];

      res.status(200).json({
        pinnedHighlights,
        recentHighlights,
        linkedArticles,
        linkedNotes
      });
    } catch (error) {
      console.error('❌ Error loading concept material:', error);
      res.status(500).json({ error: 'Failed to load concept material.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptMaterialRouter
};
