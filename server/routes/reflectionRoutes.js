const express = require('express');

const buildReflectionRouter = ({
  mongoose,
  authenticateToken,
  enqueueBrainSummary,
  BrainSummary,
  Article,
  Question,
  getReflections
}) => {
  const router = express.Router();

  router.post('/api/brain/generate', authenticateToken, async (req, res) => {
    const { timeRange = '30d' } = req.body || {};
    const allowedRanges = ['7d', '30d', '90d'];
    const safeRange = allowedRanges.includes(timeRange) ? timeRange : '30d';
    enqueueBrainSummary({ userId: req.user.id, timeRange: safeRange });
    res.status(202).json({ status: 'queued' });
  });

  router.get('/api/brain/summary', authenticateToken, async (req, res) => {
    try {
      const timeRange = req.query.timeRange || '30d';
      const summary = await BrainSummary.findOne({
        userId: req.user.id,
        timeRange
      }).sort({ generatedAt: -1 });

      if (!summary) {
        return res.status(200).json({ status: 'missing' });
      }

      const maxAgeMs = 24 * 60 * 60 * 1000;
      const isFresh = Date.now() - new Date(summary.generatedAt).getTime() < maxAgeMs;
      res.status(200).json({
        status: isFresh ? 'fresh' : 'stale',
        summary
      });
    } catch (error) {
      console.error("❌ Error fetching brain summary:", error);
      res.status(500).json({ error: "Failed to fetch brain summary." });
    }
  });

  router.get('/api/reflection', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const range = req.query.range || '30d';
      const days = parseInt(range.replace(/d/i, ''), 10);
      const windowDays = Number.isNaN(days) ? 30 : days;
      const now = new Date();
      const currentStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
      const previousStart = new Date(now.getTime() - windowDays * 2 * 24 * 60 * 60 * 1000);

      const tagAggForRange = async (start, end) => Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.createdAt': { $gte: start, ...(end ? { $lt: end } : {}) } } },
        { $unwind: '$highlights.tags' },
        { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } }
      ]);

      const [currentTags, previousTags, openQuestions] = await Promise.all([
        tagAggForRange(currentStart, null),
        tagAggForRange(previousStart, currentStart),
        Question.find({ userId, status: 'open' }).sort({ createdAt: -1 }).lean()
      ]);

      const prevMap = new Map(previousTags.map(t => [t._id, t.count]));
      const mostActiveConcepts = currentTags.slice(0, 5).map(t => ({ tag: t._id, count: t.count }));

      const increasedConcepts = currentTags
        .map(t => {
          const prevCount = prevMap.get(t._id) || 0;
          return { tag: t._id, currentCount: t.count, previousCount: prevCount, delta: t.count - prevCount };
        })
        .filter(t => t.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5);

      res.status(200).json({
        mostActiveConcepts,
        increasedConcepts,
        openQuestions
      });
    } catch (error) {
      console.error('❌ Error building reflection snapshot:', error);
      res.status(500).json({ error: 'Failed to load reflection snapshot.' });
    }
  });

  router.get('/api/reflections', authenticateToken, async (req, res) => {
    try {
      const range = req.query.range || '14d';
      const data = await getReflections(req.user.id, range);
      res.status(200).json(data);
    } catch (error) {
      console.error('❌ Error building reflections snapshot:', error);
      res.status(500).json({ error: 'Failed to load reflections.' });
    }
  });

  router.get('/api/journey', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const range = (req.query.range || '30d').toLowerCase();
      const rangeDays = { '7d': 7, '30d': 30, '90d': 90 };
      const days = rangeDays[range] || null;
      const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

      const pipeline = [
        { $match: { userId } },
        { $unwind: '$highlights' }
      ];

      if (cutoff) {
        pipeline.push({ $match: { 'highlights.createdAt': { $gte: cutoff } } });
      }

      pipeline.push({
        $group: {
          _id: '$_id',
          title: { $first: '$title' },
          url: { $first: '$url' },
          createdAt: { $first: '$createdAt' },
          highlightCount: { $sum: 1 },
          tags: { $push: '$highlights.tags' }
        }
      });

      pipeline.push({ $sort: { highlightCount: -1, createdAt: -1 } });

      const aggregated = await Article.aggregate(pipeline);

      const results = aggregated.map(doc => {
        const flatTags = (doc.tags || []).flat().filter(Boolean);
        const counts = {};
        flatTags.forEach(t => {
          counts[t] = (counts[t] || 0) + 1;
        });
        const topTags = Object.entries(counts)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 3)
          .map(([tag]) => tag);

        return {
          _id: doc._id,
          title: doc.title,
          url: doc.url,
          createdAt: doc.createdAt,
          highlightCount: doc.highlightCount,
          topTags
        };
      });

      res.status(200).json(results);
    } catch (error) {
      console.error("❌ Error building journey feed:", error);
      res.status(500).json({ error: "Failed to load journey." });
    }
  });

  return router;
};

module.exports = {
  buildReflectionRouter
};
