const express = require('express');

const buildCollectionRouter = ({
  mongoose,
  authenticateToken,
  Collection,
  slugify,
  Article
}) => {
  const router = express.Router();

  router.get('/api/collections', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const collections = await Collection.find({ userId }).sort({ updatedAt: -1 });
      res.status(200).json(collections);
    } catch (error) {
      console.error("❌ Error fetching collections:", error);
      res.status(500).json({ error: "Failed to fetch collections." });
    }
  });

  router.post('/api/collections', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, description = '', slug, articleIds = [], highlightIds = [] } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required." });
      const computedSlug = slug ? slugify(slug) : slugify(name);
      const newCollection = new Collection({
        name: name.trim(),
        description: description.trim(),
        slug: computedSlug,
        articleIds,
        highlightIds,
        userId
      });
      await newCollection.save();
      res.status(201).json(newCollection);
    } catch (error) {
      console.error("❌ Error creating collection:", error);
      if (error.code === 11000) {
        return res.status(409).json({ error: "Slug already exists." });
      }
      res.status(500).json({ error: "Failed to create collection." });
    }
  });

  router.get('/api/collections/:slug', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { slug } = req.params;
      const collection = await Collection.findOne({ slug, userId });
      if (!collection) {
        return res.status(404).json({ error: "Collection not found." });
      }

      const articles = await Article.find({ _id: { $in: collection.articleIds }, userId })
        .select('title url createdAt highlights');

      const highlightIdSet = new Set((collection.highlightIds || []).map(id => id.toString()));
      let highlights = [];
      if (highlightIdSet.size > 0) {
        const highlightAgg = await Article.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(userId) } },
          { $unwind: '$highlights' },
          { $match: { 'highlights._id': { $in: Array.from(highlightIdSet).map(id => new mongoose.Types.ObjectId(id)) } } },
          { $project: {
              _id: '$highlights._id',
              text: '$highlights.text',
              tags: '$highlights.tags',
              articleTitle: '$title',
              articleId: '$_id',
              createdAt: '$highlights.createdAt'
          } }
        ]);
        highlights = highlightAgg;
      }

      res.status(200).json({
        collection,
        articles: articles.map(a => ({
          _id: a._id,
          title: a.title,
          url: a.url,
          createdAt: a.createdAt,
          highlightCount: (a.highlights || []).length
        })),
        highlights
      });
    } catch (error) {
      console.error("❌ Error fetching collection detail:", error);
      res.status(500).json({ error: "Failed to fetch collection." });
    }
  });

  router.put('/api/collections/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { name, description, slug, articleIds, highlightIds } = req.body;
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      if (slug !== undefined) updates.slug = slugify(slug || name || '');
      if (articleIds !== undefined) updates.articleIds = articleIds;
      if (highlightIds !== undefined) updates.highlightIds = highlightIds;

      const updated = await Collection.findOneAndUpdate(
        { _id: id, userId },
        updates,
        { new: true, runValidators: true }
      );
      if (!updated) return res.status(404).json({ error: "Collection not found." });
      res.status(200).json(updated);
    } catch (error) {
      console.error("❌ Error updating collection:", error);
      if (error.code === 11000) {
        return res.status(409).json({ error: "Slug already exists." });
      }
      res.status(500).json({ error: "Failed to update collection." });
    }
  });

  router.delete('/api/collections/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const deleted = await Collection.findOneAndDelete({ _id: id, userId });
      if (!deleted) return res.status(404).json({ error: "Collection not found." });
      res.status(200).json({ message: "Collection deleted." });
    } catch (error) {
      console.error("❌ Error deleting collection:", error);
      res.status(500).json({ error: "Failed to delete collection." });
    }
  });

  return router;
};

module.exports = {
  buildCollectionRouter
};
