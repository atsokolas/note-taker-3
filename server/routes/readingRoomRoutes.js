const express = require('express');
const {
  buildReadingRoom,
  loadWorthSaying,
  phraseWorthSaying,
  explainItBack,
  canExplainBack
} = require('../services/readingRoomService');

/* getTimezoneOffset() minutes, bounded to the offsets the planet uses. */
const offsetFrom = (value) => {
  const offset = Number(value);
  return Number.isInteger(offset) && Math.abs(offset) <= 14 * 60 ? offset : 0;
};

const buildReadingRoomRouter = ({
  auth,
  humanOnly,
  mongoose,
  Article,
  ArticleReadingState,
  room = { buildReadingRoom, loadWorthSaying, phraseWorthSaying, explainItBack, canExplainBack }
}) => {
  const router = express.Router();
  const owner = (req) => new mongoose.Types.ObjectId(req.user.id);
  const models = { Article, ArticleReadingState };

  router.get('/api/library/reading-room', auth, humanOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      res.json(await room.buildReadingRoom({ models, userId: owner(req), offset: offsetFrom(req.query.tz) }));
    } catch (_) {
      res.status(503).json({ error: 'The reading room could not open. The list below still works.' });
    }
  });

  router.get('/api/library/reading-room/said', auth, humanOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const userId = owner(req);
      const lines = await room.loadWorthSaying({ models, userId, offset: offsetFrom(req.query.tz) });
      const said = lines ? await room.phraseWorthSaying(lines, { userId: String(userId) }) : null;
      res.json({ said: said ? lines.map((line, index) => ({ articleId: line.articleId, said: said[index] })) : null });
    } catch (_) {
      res.json({ said: null });
    }
  });

  const ownedArticle = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.sendStatus(404);
      return null;
    }
    const article = await Article.findOne({ _id: req.params.id, userId: req.user.id })
      .select('title content highlights.text').lean();
    if (!article) res.sendStatus(404);
    return article;
  };

  router.get('/api/articles/:id/explain-back', auth, humanOnly, async (req, res) => {
    try {
      const article = await ownedArticle(req, res);
      if (article) res.json({ available: room.canExplainBack(article) });
    } catch (_) {
      res.json({ available: false });
    }
  });

  router.post('/api/articles/:id/explain-back', auth, humanOnly, async (req, res) => {
    const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 20 || text.length > 800) {
      return res.status(400).json({ error: 'Two sentences in your own words, please.' });
    }
    try {
      const article = await ownedArticle(req, res);
      if (!article) return undefined;
      if (!room.canExplainBack(article)) return res.status(409).json({ error: 'Explain it back is not available for this piece.' });
      return res.json(await room.explainItBack({ article, text }));
    } catch (_) {
      return res.status(502).json({ error: 'Could not compare this time. Your words are still here.' });
    }
  });

  return router;
};

module.exports = { buildReadingRoomRouter, offsetFrom };
