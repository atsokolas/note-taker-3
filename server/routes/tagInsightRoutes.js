const express = require('express');

const buildTagInsightRouter = ({
  mongoose,
  authenticateToken,
  Article,
  TagMeta
}) => {
  const router = express.Router();

  router.get('/api/tags/cooccurrence', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const highlights = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $project: { tags: '$highlights.tags' } }
      ]);

      const pairCounts = {};
      highlights.forEach(h => {
        const tags = Array.isArray(h.tags) ? [...new Set(h.tags.filter(Boolean))] : [];
        for (let i = 0; i < tags.length; i++) {
          for (let j = i + 1; j < tags.length; j++) {
            const a = tags[i];
            const b = tags[j];
            if (!a || !b) continue;
            const [tagA, tagB] = a.localeCompare(b) <= 0 ? [a, b] : [b, a];
            const key = `${tagA}:::${tagB}`;
            pairCounts[key] = (pairCounts[key] || 0) + 1;
          }
        }
      });

      const pairs = Object.entries(pairCounts)
        .map(([key, count]) => {
          const [tagA, tagB] = key.split(':::');
          return { tagA, tagB, count };
        })
        .sort((a, b) => b.count - a.count || a.tagA.localeCompare(b.tagA))
        .slice(0, 20);

      res.status(200).json(pairs);
    } catch (error) {
      console.error("❌ Error computing tag cooccurrence:", error);
      res.status(500).json({ error: "Failed to compute tag cooccurrence." });
    }
  });

  router.get('/api/tags/filter', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const tagsParam = (req.query.tags || '').trim();
      if (!tagsParam) {
        return res.status(400).json({ error: "Query parameter 'tags' is required (comma-separated)." });
      }
      const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length === 0) {
        return res.status(400).json({ error: "At least one tag is required." });
      }

      const highlights = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': { $in: tags } } },
        { $project: {
            _id: '$highlights._id',
            articleId: '$_id',
            articleTitle: '$title',
            text: '$highlights.text',
            note: '$highlights.note',
            tags: '$highlights.tags',
            createdAt: '$highlights.createdAt'
        } },
        { $sort: { createdAt: -1 } },
        { $limit: 200 }
      ]);

      res.status(200).json(highlights);
    } catch (error) {
      console.error("❌ Error filtering highlights by tags:", error);
      res.status(500).json({ error: "Failed to fetch highlights by tags." });
    }
  });

  router.get('/api/tags/:tag', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const tag = req.params.tag;
      const highlights = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': tag } },
        { $project: {
            _id: '$highlights._id',
            articleId: '$_id',
            articleTitle: '$title',
            text: '$highlights.text',
            note: '$highlights.note',
            tags: '$highlights.tags',
            createdAt: '$highlights.createdAt'
        } },
        { $sort: { createdAt: -1 } }
      ]);

      const relatedCounts = {};
      highlights.forEach(h => {
        (h.tags || []).forEach(t => {
          if (t !== tag) {
            relatedCounts[t] = (relatedCounts[t] || 0) + 1;
          }
        });
      });
      const relatedTags = Object.entries(relatedCounts)
        .map(([t, count]) => ({ tag: t, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

      res.status(200).json({ tag, count: highlights.length, highlights, relatedTags });
    } catch (error) {
      console.error("❌ Error fetching tag details:", error);
      res.status(500).json({ error: "Failed to fetch tag details." });
    }
  });

  router.get('/api/tags/:name/meta', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const name = req.params.name;

      const meta = await TagMeta.findOne({ name: new RegExp(`^${name}$`, 'i'), userId });
      const pinnedIds = meta?.pinnedHighlightIds || [];

      let pinnedHighlights = [];
      if (pinnedIds.length > 0) {
        pinnedHighlights = await Article.aggregate([
          { $match: { userId } },
          { $unwind: '$highlights' },
          { $match: { 'highlights._id': { $in: pinnedIds } } },
          { $project: {
              _id: '$highlights._id',
              text: '$highlights.text',
              tags: '$highlights.tags',
              articleTitle: '$title',
              articleId: '$_id',
              createdAt: '$highlights.createdAt'
          } }
        ]);
      }

      const relatedAgg = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': name } },
        { $unwind: '$highlights.tags' },
        { $match: { 'highlights.tags': { $ne: name } } },
        { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } }
      ]);
      const relatedTags = relatedAgg.map(r => ({ tag: r._id, count: r.count }));

      const countAgg = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': name } },
        { $count: 'total' }
      ]);
      const allHighlightCount = countAgg[0]?.total || 0;

      res.status(200).json({
        name,
        description: meta?.description || '',
        pinnedHighlights,
        relatedTags,
        allHighlightCount,
        pinnedHighlightIds: pinnedIds
      });
    } catch (error) {
      console.error("❌ Error fetching tag meta:", error);
      res.status(500).json({ error: "Failed to fetch tag meta." });
    }
  });

  router.put('/api/tags/:name/meta', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const name = req.params.name;
      const { description = '', pinnedHighlightIds = [] } = req.body;

      const updated = await TagMeta.findOneAndUpdate(
        { name: new RegExp(`^${name}$`, 'i'), userId },
        { name, description, pinnedHighlightIds },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      res.status(200).json(updated);
    } catch (error) {
      console.error("❌ Error updating tag meta:", error);
      res.status(500).json({ error: "Failed to update tag meta." });
    }
  });

  router.get('/api/tags/:name/highlights', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const name = req.params.name;
      const highlights = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': name } },
        { $project: {
            _id: '$highlights._id',
            text: '$highlights.text',
            tags: '$highlights.tags',
            articleTitle: '$title',
            articleId: '$_id',
            createdAt: '$highlights.createdAt'
        } },
        { $sort: { createdAt: -1 } }
      ]);
      res.status(200).json(highlights);
    } catch (error) {
      console.error("❌ Error fetching tag highlights:", error);
      res.status(500).json({ error: "Failed to fetch highlights for tag." });
    }
  });

  return router;
};

module.exports = {
  buildTagInsightRouter
};
