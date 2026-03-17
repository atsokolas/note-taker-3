const express = require('express');

const buildTodayRouter = ({
  mongoose,
  authenticateToken,
  Article,
  NotebookEntry
}) => {
  const router = express.Router();

  const dailyPrompts = [
    'What did you learn today?',
    'Which two ideas connect from what you read?',
    'What would you teach someone from today’s highlights?',
    'What surprised you today?',
    'What’s a question you want to chase tomorrow?',
    'What should you remember six months from now?',
    'What did you disagree with, and why?'
  ];

  const getDailyPrompt = (date = new Date()) => {
    const key = date.toISOString().slice(0, 10);
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) % dailyPrompts.length;
    }
    return { id: hash, text: dailyPrompts[hash] };
  };

  router.get('/api/today', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const now = new Date();
      const cutoff7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const highlightCountAgg = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $count: 'total' }
      ]);
      const totalHighlights = highlightCountAgg[0]?.total || 0;
      const sampleSize = Math.min(5, totalHighlights);

      const resurfacePromise = totalHighlights === 0 ? Promise.resolve([]) : Article.aggregate([
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

      const journeyPromise = Article.find({ userId, createdAt: { $gte: cutoff7 } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title createdAt url')
        .lean();

      const notebookPromise = NotebookEntry.find({ userId }).sort({ updatedAt: -1 }).limit(3).select('title updatedAt').lean();

      const activeConceptsPromise = Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.createdAt': { $gte: cutoff7 } } },
        { $unwind: '$highlights.tags' },
        { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 5 }
      ]);

      const [resurfacedHighlights, recentArticles, recentNotebookEntries, activeConceptsAgg] = await Promise.all([
        resurfacePromise,
        journeyPromise,
        notebookPromise,
        activeConceptsPromise
      ]);

      res.status(200).json({
        resurfacedHighlights: resurfacedHighlights || [],
        recentArticles,
        recentNotebookEntries,
        activeConcepts: activeConceptsAgg.map(t => ({ tag: t._id, count: t.count })),
        dailyPrompt: getDailyPrompt(now)
      });
    } catch (error) {
      console.error("❌ Error building today snapshot:", error);
      res.status(500).json({ error: "Failed to load today snapshot." });
    }
  });

  return router;
};

module.exports = {
  buildTodayRouter
};
