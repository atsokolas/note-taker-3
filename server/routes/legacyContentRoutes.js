const express = require('express');
const { serializeHighlightWithArticle } = require('../utils/highlightUtils');

const buildLegacyContentRouter = ({
  authenticateToken,
  mongoose,
  Note,
  normalizeChecklist,
  Folder,
  normalizePdfs,
  Article,
  enqueueArticleEmbedding,
  safeMapEmbedding,
  articleToEmbeddingItems,
  queueEmbeddingUpsert,
  getFoldersWithCounts,
  normalizeItemType,
  buildEmbeddingId,
  queueEmbeddingDelete
}) => {
  const router = express.Router();

  const clampListLimit = (value, fallback = 1000, max = 1000) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.floor(parsed), max);
  };

  const buildArticleSort = (sort = 'recent') => {
    if (sort === 'oldest') return { createdAt: 1, _id: 1 };
    if (sort === 'most-highlighted') return { highlightCount: -1, createdAt: -1, _id: -1 };
    return { createdAt: -1, _id: -1 };
  };

  const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  router.get('/api/notes', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const notes = await Note.find({ userId }).sort({ updatedAt: -1 });
      res.status(200).json(notes);
    } catch (error) {
      console.error("❌ Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes." });
    }
  });

  router.post('/api/notes', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { title, content, checklist } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ error: "A title is required to create a note." });
      }

      const newNote = new Note({
        title: title.trim(),
        content: content || '',
        checklist: normalizeChecklist(checklist),
        userId
      });

      await newNote.save();
      res.status(201).json(newNote);
    } catch (error) {
      console.error("❌ Error creating note:", error);
      res.status(500).json({ error: "Failed to create note." });
    }
  });

  router.patch('/api/notes/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { title, content, checklist } = req.body;

      const updates = {};
      if (title !== undefined) {
        const trimmed = title.trim();
        updates.title = trimmed.length ? trimmed : 'Untitled note';
      }
      if (content !== undefined) updates.content = content;
      if (checklist !== undefined) updates.checklist = normalizeChecklist(checklist);

      const updatedNote = await Note.findOneAndUpdate(
        { _id: id, userId },
        updates,
        { new: true }
      );

      if (!updatedNote) {
        return res.status(404).json({ error: "Note not found or you do not have permission to edit it." });
      }

      res.status(200).json(updatedNote);
    } catch (error) {
      console.error("❌ Error updating note:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid note ID format." });
      }
      res.status(500).json({ error: "Failed to update note." });
    }
  });

  router.delete('/api/notes/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const deletedNote = await Note.findOneAndDelete({ _id: id, userId });
      if (!deletedNote) {
        return res.status(404).json({ error: "Note not found or you do not have permission to delete it." });
      }

      res.status(200).json({ message: "Note deleted successfully." });
    } catch (error) {
      console.error("❌ Error deleting note:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid note ID format." });
      }
      res.status(500).json({ error: "Failed to delete note." });
    }
  });

  router.post('/save-article', authenticateToken, async (req, res) => {
    try {
      const { title, url, content, folderId, author, publicationDate, siteName, pdfs } = req.body;
      const userId = req.user.id;

      if (!title || !url) {
        return res.status(400).json({ error: "Missing required fields: title and url." });
      }

      let actualFolderId = null;
      if (folderId && folderId !== 'null' && folderId !== 'uncategorized') {
        const folderExists = await Folder.findOne({ _id: folderId, userId: userId });
        if (!folderExists) {
          console.warn(`Attempted to save article with non-existent or unauthorized folderId: ${folderId} for user ${userId}`);
          return res.status(400).json({ error: "Provided folderId does not exist or is not accessible." });
        }
        actualFolderId = folderId;
      }
      const articleData = {
        title: title,
        content: content || '',
        folder: actualFolderId,
        userId: userId,
        author: author || '',
        publicationDate: publicationDate || '',
        siteName: siteName || '',
        ...(pdfs !== undefined ? { pdfs: normalizePdfs(pdfs) } : {}),
        $setOnInsert: { highlights: [] }
      };

      const updatedArticle = await Article.findOneAndUpdate({ url: url, userId: userId }, articleData, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      });
      enqueueArticleEmbedding(updatedArticle);
      const articleItems = safeMapEmbedding(
        () => articleToEmbeddingItems(updatedArticle, String(userId)),
        'article'
      );
      if (Array.isArray(articleItems)) {
        queueEmbeddingUpsert(articleItems);
      }
      res.status(200).json(updatedArticle);
    } catch (error) {
      console.error("❌ Error in /save-article:", error);
      res.status(500).json({ error: "Internal server error.", details: error.message });
    }
  });

  router.get('/api/folders', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const includeCounts = String(req.query.includeCounts || '').toLowerCase() === 'true';
      if (includeCounts) {
        const data = await getFoldersWithCounts(userId);
        return res.json(data);
      }
      const folders = await Folder.find({ userId: userId }).sort({ name: 1 });
      return res.json(folders);
    } catch (err) {
      console.error("❌ Failed to fetch folders:", err);
      res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  router.get('/folders', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const folders = await Folder.find({ userId: userId }).sort({ name: 1 });
      res.json(folders);
    } catch (err) {
      console.error("❌ Failed to fetch folders:", err);
      res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  router.post('/folders', authenticateToken, async (req, res) => {
    try {
      const { name } = req.body;
      const userId = req.user.id;
      if (!name) {
        return res.status(400).json({ error: "Folder name is required." });
      }
      const existingFolder = await Folder.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, userId: userId });
      if (existingFolder) {
        return res.status(409).json({ error: "A folder with this name already exists for your account." });
      }
      const newFolder = new Folder({ name, userId: userId });
      await newFolder.save();
      res.status(201).json(newFolder);
    } catch (err) {
      console.error("❌ Failed to create folder:", err);
      res.status(500).json({ error: "Failed to create folder" });
    }
  });

  router.delete('/folders/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const articlesInFolder = await Article.countDocuments({ folder: id, userId: userId });
      if (articlesInFolder > 0) {
        return res.status(409).json({ error: "Cannot delete folder with articles. Please move or delete articles first." });
      }

      const result = await Folder.findOneAndDelete({ _id: id, userId: userId });
      if (!result) {
        return res.status(404).json({ error: "Folder not found or you do not have permission to delete it." });
      }
      res.status(200).json({ message: "Folder deleted successfully." });
    } catch (error) {
      console.error("❌ Error deleting folder:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid folder ID format." });
      }
      res.status(500).json({ error: "Failed to delete folder.", details: error.message });
    }
  });

  router.get('/get-articles', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const articles = await Article.find({ userId: userId })
        .populate('folder')
        .select('title url createdAt folder highlights')
        .sort({ createdAt: -1 });
      res.json(articles);
    } catch (err) {
      console.error("❌ Failed to fetch articles:", err);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
  });

  router.get('/api/articles', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const {
        scope = 'all',
        folderId = '',
        q = '',
        query = '',
        sort = 'recent',
        limit
      } = req.query;
      const match = { userId };
      const normalizedScope = String(scope || 'all').trim();
      if (normalizedScope === 'unfiled') {
        match.$or = [{ folder: null }, { folder: { $exists: false } }];
      } else if (normalizedScope === 'folder' && folderId) {
        match.folder = new mongoose.Types.ObjectId(folderId);
      }

      const normalizedQuery = String(q || query || '').trim();
      if (normalizedQuery) {
        const regex = new RegExp(escapeRegex(normalizedQuery), 'i');
        match.$and = [
          ...(match.$and || []),
          { $or: [{ title: regex }, { url: regex }, { siteName: regex }] }
        ];
      }

      const rows = await Article.aggregate([
        { $match: match },
        {
          $project: {
            title: 1,
            url: 1,
            createdAt: 1,
            updatedAt: 1,
            folder: 1,
            author: 1,
            publicationDate: 1,
            siteName: 1,
            highlightCount: { $size: { $ifNull: ['$highlights', []] } }
          }
        },
        { $sort: buildArticleSort(sort) },
        { $limit: clampListLimit(limit) },
        {
          $lookup: {
            from: 'folders',
            localField: 'folder',
            foreignField: '_id',
            as: 'folderDoc'
          }
        },
        {
          $addFields: {
            folder: {
              $let: {
                vars: { folder: { $arrayElemAt: ['$folderDoc', 0] } },
                in: {
                  $cond: [
                    { $ifNull: ['$$folder', false] },
                    {
                      _id: '$$folder._id',
                      name: '$$folder.name',
                      createdAt: '$$folder.createdAt',
                      updatedAt: '$$folder.updatedAt'
                    },
                    null
                  ]
                }
              }
            }
          }
        },
        { $project: { folderDoc: 0 } }
      ]);

      res.json(rows);
    } catch (err) {
      console.error("❌ Failed to fetch article summaries:", err);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
  });

  router.get('/articles/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const article = await Article.findOne({ _id: id, userId: userId }).populate('folder');
      if (!article) {
        return res.status(404).json({ error: "Article not found or you do not have permission to view it." });
      }
      res.status(200).json(article);
    } catch (error) {
      console.error("❌ Error fetching single article by ID:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid article ID format." });
      }
      res.status(500).json({ error: "Failed to fetch article.", details: error.message });
    }
  });

  router.get('/api/articles/:id/highlights', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const article = await Article.findOne({ _id: id, userId }).select('highlights title');
      if (!article) {
        return res.status(404).json({ error: "Article not found." });
      }
      const highlights = (article.highlights || []).map(h => (
        serializeHighlightWithArticle(article, h, {
          includeAnchor: true,
          normalizeItemType
        })
      ));
      res.status(200).json(highlights);
    } catch (error) {
      console.error("❌ Error fetching article highlights:", error);
      res.status(500).json({ error: "Failed to fetch article highlights." });
    }
  });

  router.get('/api/articles/by-url', authenticateToken, async (req, res) => {
    try {
      const { url } = req.query;
      if (!url) {
        return res.status(400).json({ error: 'URL query parameter is required.' });
      }

      const userId = req.user.id;
      const article = await Article.findOne({ url: url, userId: userId });

      if (!article) {
        return res.status(200).json(null);
      }

      res.status(200).json(article);
    } catch (error) {
      console.error("❌ Error fetching article by URL:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  router.delete('/articles/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const result = await Article.findOneAndDelete({ _id: id, userId: userId });
      if (!result) {
        return res.status(404).json({ error: "Article not found or you do not have permission to delete it." });
      }
      const ids = [
        buildEmbeddingId({ userId: String(userId), objectType: 'article', objectId: String(result._id) }),
        ...(result.highlights || []).map(h => buildEmbeddingId({
          userId: String(userId),
          objectType: 'highlight',
          objectId: String(h._id)
        }))
      ];
      queueEmbeddingDelete(ids);
      res.status(200).json({ message: "Article deleted successfully." });
    } catch (error) {
      console.error("❌ Error deleting article:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid article ID format." });
      }
      res.status(500).json({ error: "Failed to delete article.", details: error.message });
    }
  });

  router.patch('/articles/:id/move', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { folderId } = req.body;
      const userId = req.user.id;

      let targetFolder = null;
      if (folderId && folderId !== 'null' && folderId !== 'uncategorized') {
        const folderExists = await Folder.findOne({ _id: folderId, userId: userId });
        if (!folderExists) {
          return res.status(400).json({ error: "Provided folderId does not exist or is not accessible." });
        }
        targetFolder = folderId;
      }

      const updatedArticle = await Article.findOneAndUpdate(
        { _id: id, userId: userId },
        { folder: targetFolder },
        { new: true, populate: 'folder' }
      );

      if (!updatedArticle) {
        return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      }
      res.status(200).json(updatedArticle);
    } catch (error) {
      console.error("❌ Error moving article:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid article ID format." });
      }
      res.status(500).json({ error: "Failed to move article.", details: error.message });
    }
  });

  router.patch('/articles/:id/pdfs', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { pdfs } = req.body;

      const normalizedPdfs = normalizePdfs(pdfs || []);
      const updatedArticle = await Article.findOneAndUpdate(
        { _id: id, userId },
        { pdfs: normalizedPdfs },
        { new: true }
      ).populate('folder');

      if (!updatedArticle) {
        return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      }

      res.status(200).json(updatedArticle);
    } catch (error) {
      console.error("❌ Error updating article PDFs:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid article ID format." });
      }
      res.status(500).json({ error: "Failed to update PDFs.", details: error.message });
    }
  });

  router.get('/api/highlights/all', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const highlights = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          type: '$highlights.type',
          claimId: '$highlights.claimId',
          createdAt: '$highlights.createdAt'
        } },
        { $sort: { createdAt: -1 } }
      ]);
      res.status(200).json(highlights);
    } catch (error) {
      console.error("❌ Error fetching all highlights:", error);
      res.status(500).json({ error: "Failed to fetch highlights." });
    }
  });

  return router;
};

module.exports = {
  buildLegacyContentRouter
};
