const express = require('express');
const { serializeHighlightWithArticle } = require('../utils/highlightUtils');
const { deriveImportedTitle } = require('../services/importTitleService');
const { createWikiSourceEvent } = require('../services/wikiSourceEventService');
const { processWikiSourceEvent } = require('../services/wikiMaintenanceOrchestrator');
const { isProceduralShelf } = require('../lib/proceduralShelf');
const { firstGraphOf } = require('../lib/feedHome');

const applyDefaultArticleVisibility = (match, { includeSuppressed = false } = {}) => {
  if (includeSuppressed) return match;
  return {
    ...match,
    debugOnly: { $ne: true },
    archived: { $ne: true }
  };
};

const ARTICLE_PLACEMENTS = new Set(['stream', 'later', 'setAside']);

const normalizeArticlePlacement = (value) => {
  const candidate = String(value || '').trim();
  if (!candidate) return 'stream';
  return ARTICLE_PLACEMENTS.has(candidate) ? candidate : '';
};

const buildLegacyContentRouter = ({
  authenticateToken,
  mongoose,
  Note,
  normalizeChecklist,
  Folder,
  normalizePdfs,
  Article,
  enqueueArticleEmbedding,
  deleteArticleEmbeddingState,
  safeMapEmbedding,
  articleToEmbeddingItems,
  queueEmbeddingUpsert,
  getFoldersWithCounts,
  normalizeItemType,
  buildEmbeddingId,
  queueEmbeddingDelete,
  WikiPage = null,
  WikiRevision = null,
  WikiSourceEvent = null,
  WikiMaintenanceRun = null,
  NotebookEntry = null,
  TagMeta = null,
  Question = null
}) => {
  const router = express.Router();

  const emitWikiSourceEvent = async (payload = {}) => {
    try {
      const event = await createWikiSourceEvent({ WikiSourceEvent, ...payload });
      if (event && WikiPage) {
        processWikiSourceEvent({
          sourceEvent: event,
          userId: payload.userId,
          models: { WikiSourceEvent, WikiPage, WikiRevision, WikiMaintenanceRun, Article, NotebookEntry, TagMeta, Question }
        }).catch(error => console.error('Failed processing wiki source event:', error));
      }
    } catch (error) {
      console.error('Failed creating wiki source event:', error);
    }
  };

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
      const { title, url, content, folderId, author, publicationDate, siteName, pdfs, placement } = req.body;
      const userId = req.user.id;

      if (!url) {
        return res.status(400).json({ error: "Missing required fields: title and url." });
      }
      const safeTitle = deriveImportedTitle({
        metadataTitle: title,
        content,
        author,
        siteName,
        url,
        publishedAt: publicationDate
      });
      if (!safeTitle) {
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
        title: safeTitle,
        content: content || '',
        folder: actualFolderId,
        userId: userId,
        author: author || '',
        publicationDate: publicationDate || '',
        siteName: siteName || '',
        ...(pdfs !== undefined ? { pdfs: normalizePdfs(pdfs) } : {}),
        /* A placement chosen on the save card. Three decisions, one card:
           the piece arrives already filed and already placed, so it never
           touches the Imbox as triage. Absent means home, which is what a
           save has always meant. */
        ...(normalizeArticlePlacement(placement) && normalizeArticlePlacement(placement) !== 'stream'
          ? { placement: normalizeArticlePlacement(placement), placementAt: new Date() }
          : {}),
        $setOnInsert: { highlights: [] }
      };

      const updatedArticle = await Article.findOneAndUpdate({ url: url, userId: userId }, articleData, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      });
      const queuedArticleEmbedding = enqueueArticleEmbedding(updatedArticle);
      if (typeof queuedArticleEmbedding?.catch === 'function') {
        queuedArticleEmbedding.catch(error => {
          console.error('Failed queueing article embedding:', error);
        });
      }
      // Keep one summary in the legacy service until Concept Agent's remaining
      // semantic-search consumer moves to Atlas. Passage rows are Atlas-only;
      // mirroring them here would duplicate both storage and embedding spend.
      const articleItems = safeMapEmbedding(
        () => articleToEmbeddingItems(updatedArticle, String(userId)),
        'article'
      );
      if (Array.isArray(articleItems)) {
        queueEmbeddingUpsert(articleItems);
      }
      await emitWikiSourceEvent({
        userId,
        sourceType: 'article',
        sourceObjectId: updatedArticle._id,
        provider: 'library',
        eventType: 'updated',
        title: updatedArticle.title,
        summary: updatedArticle.content || '',
        url: updatedArticle.url,
        sourceUpdatedAt: updatedArticle.updatedAt || new Date(),
        metadata: { route: 'save-article' }
      });
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

  router.patch('/folders/:id/feed', authenticateToken, async (req, res) => {
    try {
      const asFeed = req.body?.asFeed;
      if (typeof asFeed !== 'boolean') {
        return res.status(400).json({ error: 'asFeed must be true or false.' });
      }
      const folder = await Folder.findOne({ _id: req.params.id, userId: req.user.id });
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found or you do not have permission to update it.' });
      }
      if (asFeed && isProceduralShelf(folder.name)) {
        return res.status(400).json({ error: 'A filing tray cannot be a feed.' });
      }
      folder.asFeed = asFeed;
      /* Screening is a decision, so it leaves a date. Unscreening clears it
         rather than leaving a stale one behind — a folder that is no longer a
         scroll has no screening to date. */
      folder.asFeedAt = asFeed ? new Date() : null;
      await folder.save();
      return res.status(200).json({
        _id: String(folder._id),
        name: folder.name,
        asFeed: Boolean(folder.asFeed),
        asFeedAt: folder.asFeedAt ? folder.asFeedAt.toISOString() : null
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid folder ID format.' });
      }
      console.error('Error screening folder as feed:', error);
      return res.status(500).json({ error: 'Failed to update this shelf.' });
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
        limit,
        includeSuppressed = '',
        includePreview = ''
      } = req.query;
      let match = { userId };
      const normalizedScope = String(scope || 'all').trim();
      if (normalizedScope === 'unfiled') {
        match.$or = [{ folder: null }, { folder: { $exists: false } }];
      } else if (normalizedScope === 'folder' && folderId) {
        match.folder = new mongoose.Types.ObjectId(folderId);
      } else if (normalizedScope === 'kept') {
        /* The shelf. `{ userId, evergreen, updatedAt }` has been on this
           collection the whole time with nothing asking for it — every reader
           of the canon so far has pulled the entire library down and filtered
           in the browser. */
        match.evergreen = true;
      }

      const normalizedQuery = String(q || query || '').trim();
      if (normalizedQuery) {
        const regex = new RegExp(escapeRegex(normalizedQuery), 'i');
        match.$and = [
          ...(match.$and || []),
          { $or: [{ title: regex }, { url: regex }, { siteName: regex }] }
        ];
      }
      match = applyDefaultArticleVisibility(match, {
        includeSuppressed: String(includeSuppressed).toLowerCase() === 'true'
      });
      const preview = String(includePreview).toLowerCase() === 'true';

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
            hiddenFromHome: 1,
            debugOnly: 1,
            archived: 1,
            /* The Kept shelf filters on this, and the drift view reads tags.
               Both were silently empty without them in the projection: an
               explicit $project drops whatever it does not name. */
            evergreen: 1,
            evergreenAt: 1,
            placement: 1,
            placementAt: 1,
            placementReason: 1,
            tags: 1,
            highlightCount: { $size: { $ifNull: ['$highlights', []] } },
            /* Where the reader left off, derived rather than stored: the
               furthest point they marked, over the length of the piece, and
               the day they last marked anything. The content itself never
               leaves the server — only the ratio does. A piece with no
               highlights, or no content to measure against, reports null,
               and the column then says nothing rather than "0% through". */
            lastPlace: {
              at: { $max: '$highlights.createdAt' },
              ratio: {
                $let: {
                  vars: {
                    furthest: { $max: '$highlights.anchor.startOffsetApprox' },
                    len: { $strLenCP: { $ifNull: ['$content', ''] } }
                  },
                  in: {
                    $cond: [
                      { $and: [{ $gt: ['$$len', 0] }, { $gt: ['$$furthest', 0] }] },
                      { $divide: ['$$furthest', '$$len'] },
                      null
                    ]
                  }
                }
              }
            },
            ...(preview ? { content: { $substrCP: [{ $ifNull: ['$content', ''] }, 0, 4000] } } : {})
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
                      asFeed: { $eq: ['$$folder.asFeed', true] },
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

      const payload = preview
        ? rows.map((row) => {
          const firstGraph = firstGraphOf(row.content);
          const { content, ...rest } = row;
          return { ...rest, firstGraph };
        })
        : rows;

      res.json(payload);
    } catch (err) {
      console.error("❌ Failed to fetch article summaries:", err);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
  });

  router.get('/articles/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      // The reader has dedicated endpoints for highlights and references. Sending
      // the whole document here also serialized PDF attachments and the embedded
      // highlight array, making an ordinary open depend on unrelated payloads.
      const article = await Article.findOne({ _id: id, userId: userId })
        .select([
          '_id',
          'url',
          'title',
          'content',
          'folder',
          'author',
          'publicationDate',
          'siteName',
          'importMeta',
          'evergreen',
          'evergreenAt',
          'placement',
          'placementAt',
          'placementReason',
          'createdAt',
          'updatedAt'
        ].join(' '))
        .populate('folder', '_id name asFeed')
        .lean();
      if (!article) {
        return res.status(404).json({ error: "Article not found or you do not have permission to view it." });
      }
      // Stamp the read. `lastOpenedAt` has existed on the schema since the
      // beginning with nothing writing it, which left "have I read this?"
      // answerable only for articles the user also highlighted. Fire-and-forget
      // and without touching `updatedAt` — reading is not editing, and a failure
      // here must never cost the reader their article.
      Article.updateOne({ _id: id, userId }, { $set: { lastOpenedAt: new Date() } }, { timestamps: false })
        .catch(error => console.error('Failed to stamp article lastOpenedAt:', error.message));
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
      if (result) {
        const ids = [
          buildEmbeddingId({ userId: String(userId), objectType: 'article', objectId: String(result._id) }),
          ...(result.highlights || []).map(h => buildEmbeddingId({
            userId: String(userId),
            objectType: 'highlight',
            objectId: String(h._id)
          }))
        ];
        // Invalidate the temporary legacy mirror while the deleted document
        // still supplies its highlight ids. Atlas cleanup is awaited below.
        queueEmbeddingDelete(ids);
      }
      if (typeof deleteArticleEmbeddingState !== 'function') {
        throw new Error('Article embedding cleanup is not configured.');
      }
      // Cleanup is idempotent and owner-scoped, so a retry after a partial
      // delete can safely finish queue and Atlas cleanup before returning 404.
      await deleteArticleEmbeddingState({ userId, articleId: id });
      if (!result) {
        return res.status(404).json({ error: "Article not found or you do not have permission to delete it." });
      }
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

  /* Evergreen: the reader's own declaration that this source is permanent.
     Everything else in the product is measured against a clock. Some reading
     is not — it is held for life, and it should stay reachable and never be
     counted as neglected. */
  router.get('/articles/:id/evergreen', authenticateToken, async (req, res) => {
    try {
      const article = await Article.findOne({ _id: req.params.id, userId: req.user.id })
        .select('_id evergreen evergreenAt')
        .lean();
      if (!article) {
        return res.status(404).json({ error: 'Article not found or you do not have permission to view it.' });
      }
      return res.status(200).json({
        _id: String(article._id),
        evergreen: Boolean(article.evergreen),
        evergreenAt: article.evergreenAt || null
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid article ID format.' });
      }
      console.error('Error reading article evergreen state:', error);
      return res.status(500).json({ error: 'Failed to read this source.' });
    }
  });

  router.patch('/articles/:id/evergreen', authenticateToken, async (req, res) => {
    try {
      if (typeof req.body?.evergreen !== 'boolean') {
        return res.status(400).json({ error: 'evergreen must be true or false.' });
      }
      const evergreen = req.body.evergreen;
      const article = await Article.findOne({ _id: req.params.id, userId: req.user.id });
      if (!article) {
        return res.status(404).json({ error: 'Article not found or you do not have permission to modify it.' });
      }
      article.evergreen = evergreen;
      /* The date is when you first decided, not when you last toggled it, so
         a canon can be read in the order it was built. */
      article.evergreenAt = evergreen ? (article.evergreenAt || new Date()) : null;
      await article.save();
      return res.status(200).json({
        _id: String(article._id),
        evergreen: article.evergreen,
        evergreenAt: article.evergreenAt
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid article ID format.' });
      }
      console.error('Error marking article evergreen:', error);
      return res.status(500).json({ error: 'Failed to update this source.' });
    }
  });

  router.get('/articles/:id/placement', authenticateToken, async (req, res) => {
    try {
      const article = await Article.findOne({ _id: req.params.id, userId: req.user.id })
        .select('_id placement placementAt placementReason evergreen evergreenAt')
        .lean();
      if (!article) {
        return res.status(404).json({ error: 'Article not found or you do not have permission to view it.' });
      }
      return res.status(200).json({
        _id: String(article._id),
        placement: normalizeArticlePlacement(article.placement) || 'stream',
        placementAt: article.placementAt || null,
        placementReason: String(article.placementReason || ''),
        evergreen: Boolean(article.evergreen),
        evergreenAt: article.evergreenAt || null
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid article ID format.' });
      }
      console.error('Error reading article placement:', error);
      return res.status(500).json({ error: 'Failed to read this source.' });
    }
  });

  router.patch('/articles/:id/placement', authenticateToken, async (req, res) => {
    try {
      const placement = normalizeArticlePlacement(req.body?.placement);
      if (!placement) {
        return res.status(400).json({ error: 'placement must be stream, later, or setAside.' });
      }
      const article = await Article.findOne({ _id: req.params.id, userId: req.user.id });
      if (!article) {
        return res.status(404).json({ error: 'Article not found or you do not have permission to modify it.' });
      }
      const previous = normalizeArticlePlacement(article.placement) || 'stream';
      article.placement = placement;
      if (placement === 'stream') {
        article.placementAt = null;
        article.placementReason = '';
      } else if (previous !== placement) {
        article.placementAt = new Date();
        if (req.body?.reason !== undefined) {
          article.placementReason = String(req.body.reason || '').trim().slice(0, 280);
        }
      } else if (req.body?.reason !== undefined) {
        article.placementReason = String(req.body.reason || '').trim().slice(0, 280);
      }
      await article.save();
      return res.status(200).json({
        _id: String(article._id),
        placement: article.placement,
        placementAt: article.placementAt,
        placementReason: article.placementReason || '',
        evergreen: Boolean(article.evergreen),
        evergreenAt: article.evergreenAt || null
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid article ID format.' });
      }
      console.error('Error marking article placement:', error);
      return res.status(500).json({ error: 'Failed to update this source.' });
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
      await emitWikiSourceEvent({
        userId,
        sourceType: 'article',
        sourceObjectId: updatedArticle._id,
        provider: 'library',
        eventType: 'updated',
        title: updatedArticle.title,
        summary: `${normalizedPdfs.length} PDFs attached.`,
        url: updatedArticle.url,
        sourceUpdatedAt: updatedArticle.updatedAt || new Date(),
        metadata: { route: 'article-pdfs', pdfCount: normalizedPdfs.length }
      });

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
  buildLegacyContentRouter,
  __testables: {
    applyDefaultArticleVisibility
  }
};
