const express = require('express');

const DEFAULT_HIGHLIGHT_COLOR = '#f6e27a';

const normalizeHighlightColor = (value) => {
  const candidate = String(value || '').trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate)) {
    return candidate.length === 4
      ? `#${candidate.slice(1).split('').map(char => `${char}${char}`).join('')}`
      : candidate.toLowerCase();
  }
  return DEFAULT_HIGHLIGHT_COLOR;
};

const buildFeedbackHighlightRouter = ({
  mongoose,
  authenticateToken,
  Feedback,
  Article,
  normalizeItemType,
  parseClaimId,
  normalizeTags,
  enqueueHighlightEmbedding,
  mapHighlightWithArticle
}) => {
  const router = express.Router();

  router.post('/api/feedback', async (req, res) => {
    try {
      const { message, rating, email, source } = req.body || {};
      const trimmedMessage = (message || '').trim();
      if (!trimmedMessage) {
        return res.status(400).json({ error: "Feedback message is required." });
      }
      const safeRating = Number.isFinite(Number(rating)) ? Math.max(1, Math.min(5, Number(rating))) : null;
      const feedback = new Feedback({
        message: trimmedMessage,
        rating: safeRating,
        email: (email || '').trim(),
        source: source || 'web-app',
        userId: req.user?.id || null
      });
      await feedback.save();
      res.status(200).json({ message: "Feedback saved. Thank you!" });
    } catch (error) {
      console.error("❌ Error saving feedback:", error);
      res.status(500).json({ error: "Failed to save feedback." });
    }
  });

  router.get('/api/feedback', authenticateToken, async (req, res) => {
    try {
      const adminList = (process.env.FEEDBACK_ADMIN_USERNAMES || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
      if (adminList.length > 0 && !adminList.includes(req.user?.username)) {
        return res.status(403).json({ error: "Not authorized to view feedback." });
      }

      const feedback = await Feedback.find().sort({ createdAt: -1 }).limit(200);
      res.status(200).json(feedback);
    } catch (error) {
      console.error("❌ Error fetching feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback." });
    }
  });

  router.get('/api/highlights', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const { folderId, tag, articleId, q, cursor, limit = 120 } = req.query;
      const match = { userId };

      if (folderId) {
        if (folderId === 'unfiled') {
          match.folder = null;
        } else {
          match.folder = new mongoose.Types.ObjectId(folderId);
        }
      }

      if (articleId) {
        match._id = new mongoose.Types.ObjectId(articleId);
      }

      const highlightMatch = {};
      if (tag) {
        highlightMatch['highlights.tags'] = tag;
      }
      if (cursor) {
        const cursorDate = new Date(cursor);
        if (!Number.isNaN(cursorDate.getTime())) {
          highlightMatch['highlights.createdAt'] = { $lt: cursorDate };
        }
      }
      if (q) {
        const regex = new RegExp(q, 'i');
        highlightMatch.$or = [
          { 'highlights.text': regex },
          { 'highlights.note': regex },
          { 'highlights.tags': regex },
          { title: regex }
        ];
      }

      const pipeline = [
        { $match: match },
        { $unwind: '$highlights' }
      ];

      if (Object.keys(highlightMatch).length > 0) {
        pipeline.push({ $match: highlightMatch });
      }

      pipeline.push(
        { $sort: { 'highlights.createdAt': -1 } },
        { $limit: Math.min(Number(limit) || 120, 200) },
        { $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          color: '$highlights.color',
          type: '$highlights.type',
          claimId: '$highlights.claimId',
          createdAt: '$highlights.createdAt'
        } }
      );

      const highlights = await Article.aggregate(pipeline);
      res.status(200).json(highlights);
    } catch (error) {
      console.error("❌ Error fetching highlights:", error);
      res.status(500).json({ error: "Failed to fetch highlights." });
    }
  });

  router.get('/api/highlights/organize/claims', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const queryText = String(req.query.q || '').trim();
      const pipeline = [
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.type': 'claim' } }
      ];
      if (queryText) {
        const regex = new RegExp(queryText, 'i');
        pipeline.push({
          $match: {
            $or: [
              { 'highlights.text': regex },
              { 'highlights.tags': regex },
              { title: regex }
            ]
          }
        });
      }
      pipeline.push(
        { $sort: { 'highlights.createdAt': -1 } },
        { $limit: 30 },
        {
          $project: {
            _id: '$highlights._id',
            articleId: '$_id',
            articleTitle: '$title',
            text: '$highlights.text',
            tags: '$highlights.tags',
            createdAt: '$highlights.createdAt'
          }
        }
      );
      const claims = await Article.aggregate(pipeline);
      res.status(200).json(claims);
    } catch (error) {
      console.error("❌ Error fetching highlight claims:", error);
      res.status(500).json({ error: 'Failed to fetch claims.' });
    }
  });

  router.patch('/api/highlights/:id/organize', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const highlightId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(highlightId)) {
        return res.status(400).json({ error: 'Invalid highlight ID format.' });
      }
      const { type, tags, claimId, color } = req.body || {};
      const article = await Article.findOne({ userId, 'highlights._id': new mongoose.Types.ObjectId(highlightId) });
      if (!article) {
        return res.status(404).json({ error: 'Highlight not found.' });
      }
      const highlight = article.highlights.id(highlightId);
      if (!highlight) {
        return res.status(404).json({ error: 'Highlight not found.' });
      }

      const hasType = type !== undefined;
      const nextType = hasType ? normalizeItemType(type, '') : normalizeItemType(highlight.type, 'note');
      if (hasType && !nextType) {
        return res.status(400).json({ error: 'type must be one of claim, evidence, note.' });
      }

      let nextClaimId = claimId !== undefined ? parseClaimId(claimId) : highlight.claimId;
      if (claimId !== undefined && claimId !== null && claimId !== '' && !nextClaimId) {
        return res.status(400).json({ error: 'Invalid claimId.' });
      }

      if (nextType !== 'evidence') {
        nextClaimId = null;
      }

      if (nextType === 'evidence' && nextClaimId) {
        const claimArticle = await Article.findOne({ userId, 'highlights._id': nextClaimId }).select('highlights');
        const claimHighlight = claimArticle?.highlights?.id(nextClaimId) || null;
        if (!claimHighlight || normalizeItemType(claimHighlight.type, 'note') !== 'claim') {
          return res.status(400).json({ error: 'claimId must reference one of your claim highlights.' });
        }
        if (String(claimHighlight._id) === String(highlight._id)) {
          return res.status(400).json({ error: 'An evidence highlight cannot link to itself as a claim.' });
        }
      }

      if (hasType) highlight.type = nextType;
      if (tags !== undefined) highlight.tags = normalizeTags(tags);
      if (color !== undefined) highlight.color = normalizeHighlightColor(color);
      highlight.claimId = nextClaimId;
      await article.save();
      enqueueHighlightEmbedding({ highlight, article });
      res.status(200).json(mapHighlightWithArticle(article, highlight));
    } catch (error) {
      console.error("❌ Error organizing highlight:", error);
      res.status(500).json({ error: 'Failed to organize highlight.' });
    }
  });

  router.post('/api/highlights/:id/link-claim', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const highlightId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(highlightId)) {
        return res.status(400).json({ error: 'Invalid highlight ID format.' });
      }
      const claimObjectId = parseClaimId(req.body?.claimId);
      if (!claimObjectId) {
        return res.status(400).json({ error: 'claimId is required.' });
      }

      const evidenceArticle = await Article.findOne({ userId, 'highlights._id': new mongoose.Types.ObjectId(highlightId) });
      if (!evidenceArticle) {
        return res.status(404).json({ error: 'Highlight not found.' });
      }
      const evidenceHighlight = evidenceArticle.highlights.id(highlightId);

      const claimArticle = await Article.findOne({ userId, 'highlights._id': claimObjectId });
      const claimHighlight = claimArticle?.highlights?.id(claimObjectId) || null;
      if (!claimHighlight || normalizeItemType(claimHighlight.type, 'note') !== 'claim') {
        return res.status(400).json({ error: 'claimId must reference one of your claim highlights.' });
      }
      if (String(claimHighlight._id) === String(evidenceHighlight._id)) {
        return res.status(400).json({ error: 'An evidence highlight cannot link to itself as a claim.' });
      }

      evidenceHighlight.type = 'evidence';
      evidenceHighlight.claimId = claimHighlight._id;
      await evidenceArticle.save();
      enqueueHighlightEmbedding({ highlight: evidenceHighlight, article: evidenceArticle });
      res.status(200).json(mapHighlightWithArticle(evidenceArticle, evidenceHighlight));
    } catch (error) {
      console.error("❌ Error linking highlight evidence to claim:", error);
      res.status(500).json({ error: 'Failed to link evidence to claim.' });
    }
  });

  router.get('/api/highlights/:id/claim', authenticateToken, async (req, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const claimId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(claimId)) {
        return res.status(400).json({ error: 'Invalid highlight ID format.' });
      }
      const claimObjectId = new mongoose.Types.ObjectId(claimId);

      const claimRows = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        {
          $match: {
            'highlights._id': claimObjectId,
            'highlights.type': 'claim'
          }
        },
        {
          $project: {
            _id: '$highlights._id',
            articleId: '$_id',
            articleTitle: '$title',
            text: '$highlights.text',
            note: '$highlights.note',
            tags: '$highlights.tags',
            type: '$highlights.type',
            claimId: '$highlights.claimId',
            createdAt: '$highlights.createdAt'
          }
        }
      ]);
      const claim = claimRows[0];
      if (!claim) {
        return res.status(404).json({ error: 'Claim highlight not found.' });
      }

      const evidence = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        {
          $match: {
            'highlights.type': 'evidence',
            'highlights.claimId': claimObjectId
          }
        },
        { $sort: { 'highlights.createdAt': -1 } },
        {
          $project: {
            _id: '$highlights._id',
            articleId: '$_id',
            articleTitle: '$title',
            text: '$highlights.text',
            note: '$highlights.note',
            tags: '$highlights.tags',
            type: '$highlights.type',
            claimId: '$highlights.claimId',
            createdAt: '$highlights.createdAt'
          }
        }
      ]);

      res.status(200).json({ claim, evidence });
    } catch (error) {
      console.error("❌ Error fetching claim evidence:", error);
      res.status(500).json({ error: 'Failed to fetch claim evidence.' });
    }
  });

  return router;
};

module.exports = {
  buildFeedbackHighlightRouter
};
