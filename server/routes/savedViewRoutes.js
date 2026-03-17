const express = require('express');

const buildSavedViewRouter = ({
  mongoose,
  authenticateToken,
  SavedView,
  Article,
  NotebookEntry
}) => {
  const router = express.Router();

  router.get('/api/views', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const views = await SavedView.find({ userId }).sort({ updatedAt: -1 });
      res.status(200).json(views);
    } catch (error) {
      console.error("❌ Error fetching views:", error);
      res.status(500).json({ error: "Failed to fetch views." });
    }
  });

  router.post('/api/views', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, description = '', targetType = 'highlights', filters = {} } = req.body;
      const view = new SavedView({ name, description, targetType, filters, userId });
      await view.save();
      res.status(201).json(view);
    } catch (error) {
      console.error("❌ Error creating view:", error);
      res.status(500).json({ error: "Failed to create view." });
    }
  });

  router.get('/api/views/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const view = await SavedView.findOne({ _id: req.params.id, userId });
      if (!view) return res.status(404).json({ error: "View not found." });
      res.status(200).json(view);
    } catch (error) {
      console.error("❌ Error fetching view:", error);
      res.status(500).json({ error: "Failed to fetch view." });
    }
  });

  router.put('/api/views/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, description, targetType, filters } = req.body;
      const updated = await SavedView.findOneAndUpdate(
        { _id: req.params.id, userId },
        { name, description, targetType, filters },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: "View not found." });
      res.status(200).json(updated);
    } catch (error) {
      console.error("❌ Error updating view:", error);
      res.status(500).json({ error: "Failed to update view." });
    }
  });

  router.delete('/api/views/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const deleted = await SavedView.findOneAndDelete({ _id: req.params.id, userId });
      if (!deleted) return res.status(404).json({ error: "View not found." });
      res.status(200).json({ message: "View deleted." });
    } catch (error) {
      console.error("❌ Error deleting view:", error);
      res.status(500).json({ error: "Failed to delete view." });
    }
  });

  router.get('/api/views/:id/run', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const view = await SavedView.findOne({ _id: req.params.id, userId });
      if (!view) return res.status(404).json({ error: "View not found." });

      const { targetType, filters = {} } = view;
      const { tags = [], textQuery = '', dateFrom, dateTo, folders = [] } = filters;
      const regex = textQuery ? new RegExp(textQuery, 'i') : null;
      const dateFilter = {};
      if (dateFrom) dateFilter.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.$lte = new Date(dateTo);

      let items = [];

      if (targetType === 'articles') {
        const pipeline = [
          { $match: { userId: new mongoose.Types.ObjectId(userId) } }
        ];
        if (folders && folders.length > 0) {
          pipeline.push({ $match: { $or: [{ folder: { $in: folders.map(f => new mongoose.Types.ObjectId(f)) } }, { folder: { $exists: false } }] } });
        }
        if (regex) {
          pipeline.push({ $match: { $or: [{ title: regex }, { content: regex }] } });
        }
        if (tags && tags.length > 0) {
          pipeline.push({ $unwind: '$highlights' });
          pipeline.push({ $match: { 'highlights.tags': { $in: tags } } });
          pipeline.push({
            $group: {
              _id: '$_id',
              title: { $first: '$title' },
              url: { $first: '$url' },
              createdAt: { $first: '$createdAt' },
              updatedAt: { $first: '$updatedAt' }
            }
          });
        }
        if (Object.keys(dateFilter).length > 0) {
          pipeline.push({ $match: { createdAt: dateFilter } });
        }
        items = await Article.aggregate(pipeline);
      } else if (targetType === 'notebook') {
        const query = { userId };
        if (regex) query.$or = [{ title: regex }, { content: regex }];
        if (tags && tags.length > 0) query.tags = { $in: tags };
        if (Object.keys(dateFilter).length > 0) query.createdAt = dateFilter;
        items = await NotebookEntry.find(query).sort({ updatedAt: -1 });
      } else {
        const pipeline = [
          { $match: { userId: new mongoose.Types.ObjectId(userId) } },
          { $unwind: '$highlights' }
        ];
        if (tags && tags.length > 0) {
          pipeline.push({ $match: { 'highlights.tags': { $in: tags } } });
        }
        if (regex) {
          pipeline.push({ $match: { $or: [{ 'highlights.text': regex }, { 'highlights.note': regex }] } });
        }
        if (Object.keys(dateFilter).length > 0) {
          pipeline.push({ $match: { 'highlights.createdAt': dateFilter } });
        }
        pipeline.push({
          $project: {
            _id: '$highlights._id',
            text: '$highlights.text',
            note: '$highlights.note',
            tags: '$highlights.tags',
            createdAt: '$highlights.createdAt',
            articleId: '$_id',
            articleTitle: '$title'
          }
        });
        items = await Article.aggregate(pipeline);
      }

      res.status(200).json({ targetType, items });
    } catch (error) {
      console.error("❌ Error running view:", error);
      res.status(500).json({ error: "Failed to run view." });
    }
  });

  return router;
};

module.exports = {
  buildSavedViewRouter
};
